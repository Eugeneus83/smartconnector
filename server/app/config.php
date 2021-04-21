<?php 

require_once dirname(__DIR__). '/config/db.php';
require_once dirname(__DIR__). '/config/mail.php';

define('INVITATION_DELAY', 300);
define('MESSAGES_DELAY', 30);
define('SAME_PERSON_MESSAGES_DELAY', 300);
define('MAX_FOLLOWUP_CAMPAIGN', 30);
define('MAIN_PATH', $_SERVER['DOCUMENT_ROOT']);
define('MEDIA_DIR', __DIR__. '/media');
define('CLASSES_DIR', dirname(__DIR__). '/classes');
define('TEMP_DIR', __DIR__. '/temp');


?>