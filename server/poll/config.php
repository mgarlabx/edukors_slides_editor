<?php

/**
 * Loads the poll service configuration.
 *
 * The folder is self-contained so that anyone can host their own copy. The
 * first file found wins:
 *
 * 1. the path in the EDUKORS_POLL_CONFIG environment variable;
 * 2. private/poll.config.php beside the web root (edukors.org layout);
 * 3. private/poll.config.php beside this folder;
 * 4. poll.config.php inside this folder (only for hosts that offer no place
 *    outside the web root; PHP never prints it, but keep backups out of here).
 *
 * The file defines $db_host_poll, $db_name_poll, $db_user_poll, $db_pass_poll
 * and, optionally, $poll_base_url. See poll.config.example.php.
 */

$poll_base_url = '';

$pollConfigCandidates = array_filter([
    getenv('EDUKORS_POLL_CONFIG') ?: null,
    __DIR__ . '/../../private/poll.config.php',
    __DIR__ . '/../private/poll.config.php',
    __DIR__ . '/poll.config.php',
]);

$pollConfigFile = null;
foreach ($pollConfigCandidates as $candidate) {
    if (is_file($candidate)) {
        $pollConfigFile = $candidate;
        break;
    }
}

if ($pollConfigFile === null) {
    http_response_code(500);
    header('Content-Type: application/json');
    error_log('Poll: no configuration file found');
    echo json_encode(['error' => 'not_configured']);
    exit;
}

require $pollConfigFile;
