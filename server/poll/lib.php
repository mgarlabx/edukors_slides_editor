<?php

/**
 * Helpers shared by the presenter API (q.php), the student API (r/r.php) and
 * the command-line tools (bin/).
 */

ini_set('display_errors', '0');
ini_set('html_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/config.php';

const POLL_SESSION_HOURS = 12;
const POLL_ROOM_DAYS = 30;
const POLL_ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
const POLL_TYPES = ['quiz', 'tag', 'post'];
const POLL_MAX_OPTIONS = 5;
const POLL_MAX_TEXT = 500;
const POLL_MAX_ROWS = 50;
const POLL_MAX_EXPORT = 20000;

function pollPdo(): PDO
{
    global $db_host_poll, $db_name_poll, $db_user_poll, $db_pass_poll;
    return new PDO("mysql:host=$db_host_poll;dbname=$db_name_poll;charset=utf8mb4", $db_user_poll, $db_pass_poll, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}

function pollJson(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function pollFail(int $status, string $code): never
{
    pollJson($status, ['error' => $code]);
}

/**
 * Answers preflight and refuses anything but a JSON POST. Returns the body.
 */
function pollRequest(): array
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        pollFail(405, 'method_not_allowed');
    }
    $body = json_decode((string) file_get_contents('php://input', false, null, 0, 65536), true);
    if (!is_array($body) || !is_string($body['proc'] ?? null)) {
        pollFail(400, 'invalid_body');
    }
    return $body;
}

function pollHash(string $value): string
{
    return hash('sha256', $value);
}

function pollNow(): string
{
    return gmdate('Y-m-d H:i:s');
}

function pollRoomId(): string
{
    $alphabet = POLL_ROOM_ALPHABET;
    $room = '';
    for ($i = 0; $i < 6; $i++) {
        $room .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return $room;
}

function pollIsRoom(mixed $room): bool
{
    return is_string($room) && preg_match('/^[' . POLL_ROOM_ALPHABET . ']{6}$/', $room) === 1;
}

/**
 * Public URL of this folder. A configured value wins; otherwise it is derived
 * from the request, which is right for any host that serves the folder as is.
 */
function pollBaseUrl(): string
{
    global $poll_base_url;
    if (is_string($poll_base_url) && $poll_base_url !== '') {
        return rtrim($poll_base_url, '/');
    }
    $https = ($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off'
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/q.php')), '/');
    return ($https ? 'https' : 'http') . '://' . $host . $dir;
}

/**
 * The presenter that owns a live session token, or null.
 */
function pollSession(PDO $pdo, mixed $token): ?int
{
    if (!is_string($token) || preg_match('/^[0-9a-f]{64}$/', $token) !== 1) {
        return null;
    }
    $statement = $pdo->prepare(
        'SELECT s.presenter_id FROM poll_session s JOIN poll_presenter p ON p.id = s.presenter_id
         WHERE s.token_hash = :hash AND s.expires_at > :now AND p.active = 1'
    );
    $statement->execute([':hash' => pollHash($token), ':now' => pollNow()]);
    $id = $statement->fetchColumn();
    return $id === false ? null : (int) $id;
}

/**
 * Removes expired sessions and old rooms now and then, so no cron job is needed.
 */
function pollHousekeeping(PDO $pdo): void
{
    if (random_int(1, 50) !== 1) {
        return;
    }
    $pdo->prepare('DELETE FROM poll_session WHERE expires_at < :now')->execute([':now' => pollNow()]);
    $limit = gmdate('Y-m-d H:i:s', time() - POLL_ROOM_DAYS * 86400);
    $pdo->prepare('DELETE r FROM poll_response r JOIN poll_room m ON m.room = r.room WHERE m.created_at < :limit')->execute([':limit' => $limit]);
    $pdo->prepare('DELETE FROM poll_room WHERE created_at < :limit')->execute([':limit' => $limit]);
}
