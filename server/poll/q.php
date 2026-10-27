<?php

/**
 * Presenter API. Called from exported presentations opened from disk, whose
 * origin is "null", so CORS stays open; the session token in the body, not a
 * cookie, is what authorizes each call.
 *
 * Body: {"proc": "...", "token": "...", ...}. Replies {"data": ...} or
 * {"error": "<code>"} with a matching HTTP status.
 */

require_once __DIR__ . '/lib.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');

$body = pollRequest();
$proc = $body['proc'];

if ($proc === 'ping') {
    pollJson(200, ['data' => ['service' => 'edukors-poll', 'version' => 1]]);
}

try {
    $pdo = pollPdo();
} catch (Throwable $e) {
    error_log('Poll: database connection failed: ' . $e->getMessage());
    pollFail(503, 'unavailable');
}

try {
    pollHousekeeping($pdo);

    if ($proc === 'auth') {
        $key = $body['key'] ?? null;
        $statement = $pdo->prepare('SELECT id FROM poll_presenter WHERE key_hash = :hash AND active = 1');
        $statement->execute([':hash' => pollHash(is_string($key) ? trim($key) : '')]);
        $presenter = $statement->fetchColumn();
        if (!is_string($key) || strlen($key) > 200 || $presenter === false) {
            usleep(300000);
            pollFail(401, 'invalid_key');
        }
        $token = bin2hex(random_bytes(32));
        $expires = time() + POLL_SESSION_HOURS * 3600;
        $pdo->prepare('INSERT INTO poll_session (token_hash, presenter_id, created_at, expires_at) VALUES (:hash, :id, :now, :expires)')
            ->execute([':hash' => pollHash($token), ':id' => $presenter, ':now' => pollNow(), ':expires' => gmdate('Y-m-d H:i:s', $expires)]);
        $pdo->prepare('UPDATE poll_presenter SET last_login_at = :now WHERE id = :id')->execute([':now' => pollNow(), ':id' => $presenter]);
        pollJson(200, ['data' => ['token' => $token, 'expiresAt' => $expires * 1000]]);
    }

    $presenter = pollSession($pdo, $body['token'] ?? null);
    if ($presenter === null) {
        pollFail(401, 'session_expired');
    }

    if ($proc === 'prepare') {
        $type = $body['type'] ?? null;
        $meta = $body['meta'] ?? 0;
        if (!in_array($type, POLL_TYPES, true)) {
            pollFail(400, 'invalid_type');
        }
        if ($type === 'quiz' && (!is_int($meta) || $meta < 2 || $meta > POLL_MAX_OPTIONS)) {
            pollFail(400, 'invalid_meta');
        }
        $meta = $type === 'quiz' ? $meta : 0;
        $insert = $pdo->prepare('INSERT INTO poll_room (room, presenter_id, type, meta, status, created_at) VALUES (:room, :id, :type, :meta, 0, :now)');
        for ($attempt = 0; $attempt < 8; $attempt++) {
            $room = pollRoomId();
            try {
                $insert->execute([':room' => $room, ':id' => $presenter, ':type' => $type, ':meta' => $meta, ':now' => pollNow()]);
                pollJson(200, ['data' => ['room' => $room, 'url' => pollBaseUrl() . '/r/?room=' . $room]]);
            } catch (PDOException $e) {
                if ($e->getCode() !== '23000') {
                    throw $e;
                }
            }
        }
        pollFail(503, 'no_room');
    }

    $room = $body['room'] ?? null;
    if (!pollIsRoom($room)) {
        pollFail(400, 'invalid_room');
    }
    $statement = $pdo->prepare('SELECT type, meta, status FROM poll_room WHERE room = :room AND presenter_id = :id');
    $statement->execute([':room' => $room, ':id' => $presenter]);
    $info = $statement->fetch();
    if ($info === false) {
        pollFail(404, 'room_not_found');
    }

    if ($proc === 'open' || $proc === 'close') {
        $sql = $proc === 'open'
            ? 'UPDATE poll_room SET status = 1, closed_at = NULL WHERE room = :room'
            : 'UPDATE poll_room SET status = 0, closed_at = :now WHERE room = :room';
        $params = $proc === 'open' ? [':room' => $room] : [':room' => $room, ':now' => pollNow()];
        $pdo->prepare($sql)->execute($params);
        pollJson(200, ['data' => 'ok']);
    }

    if ($proc === 'count') {
        $statement = $pdo->prepare('SELECT COUNT(*) FROM poll_response WHERE room = :room');
        $statement->execute([':room' => $room]);
        pollJson(200, ['data' => ['responses' => (int) $statement->fetchColumn(), 'status' => (int) $info['status']]]);
    }

    if ($proc === 'results') {
        $queries = [
            'quiz' => 'SELECT CAST(response AS UNSIGNED) AS response, COUNT(*) AS responses FROM poll_response WHERE room = :room GROUP BY response ORDER BY response',
            'tag'  => 'SELECT response, COUNT(*) AS responses FROM poll_response WHERE room = :room GROUP BY response ORDER BY responses DESC, response LIMIT ' . POLL_MAX_ROWS,
            'post' => 'SELECT response FROM poll_response WHERE room = :room AND CHAR_LENGTH(TRIM(response)) > 3 ORDER BY created_at LIMIT ' . POLL_MAX_ROWS,
        ];
        $statement = $pdo->prepare($queries[$info['type']]);
        $statement->execute([':room' => $room]);
        $shape = [
            'quiz' => fn(array $row) => ['response' => (int) $row['response'], 'responses' => (int) $row['responses']],
            'tag'  => fn(array $row) => ['response' => (string) $row['response'], 'responses' => (int) $row['responses']],
            'post' => fn(array $row) => ['response' => (string) $row['response']],
        ][$info['type']];
        pollJson(200, ['data' => array_map($shape, $statement->fetchAll())]);
    }

    if ($proc === 'export') {
        // Every answer of the room, oldest first, for the presenter's CSV download. Participant ids stay out.
        $statement = $pdo->prepare('SELECT response, created_at FROM poll_response WHERE room = :room ORDER BY created_at, participant LIMIT ' . POLL_MAX_EXPORT);
        $statement->execute([':room' => $room]);
        $rows = array_map(fn(array $row) => ['response' => (string) $row['response'], 'at' => str_replace(' ', 'T', $row['created_at']) . 'Z'], $statement->fetchAll());
        pollJson(200, ['data' => ['type' => $info['type'], 'meta' => (int) $info['meta'], 'rows' => $rows]]);
    }

    pollFail(400, 'invalid_proc');
} catch (Throwable $e) {
    error_log('Poll: ' . $e->getMessage());
    pollFail(500, 'server_error');
}
