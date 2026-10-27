<?php

/**
 * Creates a presenter and prints the new key once (only its hash is stored).
 *
 *   php bin/newkey.php "Presenter name"
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../lib.php';
ini_set('display_errors', '1');

$name = trim($argv[1] ?? '');
if ($name === '' || mb_strlen($name) > 120) {
    fwrite(STDERR, "Usage: php bin/newkey.php \"Presenter name\"\n");
    exit(1);
}

$alphabet = POLL_ROOM_ALPHABET;
$groups = [];
for ($g = 0; $g < 4; $g++) {
    $group = '';
    for ($i = 0; $i < 4; $i++) {
        $group .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    $groups[] = $group;
}
$key = 'EDK-' . implode('-', $groups);

pollPdo()->prepare('INSERT INTO poll_presenter (key_hash, name, active, created_at) VALUES (:hash, :name, 1, :now)')
    ->execute([':hash' => pollHash($key), ':name' => $name, ':now' => pollNow()]);

echo "Presenter: $name\nKey: $key\n";
