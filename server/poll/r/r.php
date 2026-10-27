<?php

/**
 * Student API, called by the page in this folder (same origin, no CORS).
 *
 * Body: {"proc": "status", "room": "..."} or
 *       {"proc": "respond", "room": "...", "participant": "...", "response": ...}.
 */

require_once __DIR__ . '/../lib.php';

$body = pollRequest();
$proc = $body['proc'];
$room = $body['room'] ?? null;
if (!pollIsRoom($room)) {
    pollFail(404, 'room_not_found');
}

try {
    $pdo = pollPdo();
} catch (Throwable $e) {
    error_log('Poll: database connection failed: ' . $e->getMessage());
    pollFail(503, 'unavailable');
}

try {
    $statement = $pdo->prepare('SELECT type, meta, status FROM poll_room WHERE room = :room');
    $statement->execute([':room' => $room]);
    $info = $statement->fetch();
    if ($info === false) {
        pollFail(404, 'room_not_found');
    }

    if ($proc === 'status') {
        pollJson(200, ['data' => ['status' => (int) $info['status'], 'type' => $info['type'], 'meta' => (int) $info['meta']]]);
    }

    if ($proc !== 'respond') {
        pollFail(400, 'invalid_proc');
    }
    if ((int) $info['status'] !== 1) {
        pollFail(409, 'closed');
    }
    $participant = $body['participant'] ?? null;
    if (!is_string($participant) || preg_match('/^[A-Za-z0-9]{16}$/', $participant) !== 1) {
        pollFail(400, 'invalid_participant');
    }
    $response = $body['response'] ?? null;
    if ($info['type'] === 'quiz') {
        if (!is_int($response) || $response < 0 || $response >= (int) $info['meta']) {
            pollFail(400, 'invalid_response');
        }
        $response = (string) $response;
    }
    if ($info['type'] !== 'quiz') {
        $response = is_string($response) ? trim(preg_replace('/\s+/u', ' ', $response) ?? '') : '';
        if ($response === '' || mb_strlen($response) > POLL_MAX_TEXT) {
            pollFail(400, 'invalid_response');
        }
    }
    try {
        $pdo->prepare('INSERT INTO poll_response (room, participant, response, created_at) VALUES (:room, :participant, :response, :now)')
            ->execute([':room' => $room, ':participant' => $participant, ':response' => $response, ':now' => pollNow()]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            pollFail(409, 'already_responded');
        }
        throw $e;
    }
    pollJson(200, ['data' => 'ok']);
} catch (Throwable $e) {
    error_log('Poll: ' . $e->getMessage());
    pollFail(500, 'server_error');
}
