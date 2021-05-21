<?php 

require dirname(__DIR__). '/config.php';
require CLASSES_DIR. '/mysql.class.php';

set_time_limit(0);

$result = [];
try {        
    $api = new Api();

    $model = isset($_GET['model'])?$_GET['model']:false;
    $action = isset($_GET['action'])?$_GET['action']:false;
    $ids = isset($_GET['ids'])?array_map('trim', explode('/', $_GET['ids'])):false; 
    $id = $ids[0];
    $id2 = isset($ids[1])?$ids[1]:null;
    
    if ($model == 'user') {
        if ($action == 'login') {
            $result = $api->login($api->getPostData(true));
        }elseif ($action == 'register') {
            $result = $api->register($api->getPostData(true));
        }elseif ($action == 'confirm') {
            $result = $api->confirmRegistration($api->getPostData(true));
        }elseif ($action == 'reset_password') {
            $result = $api->resetPassword($api->getPostData(true));
        }elseif ($action == 'update_password') {
            $result = $api->updatePassword($api->getPostData(true));
        }elseif ($action == 'get') {
            $api->checkUser();
            $result = $api->getUser();
        }
    }else {
        $api->checkUser();
        if ($model == 'campaign') {
            if (in_array($action, ['add', 'edit', 'delete'])) {
                if ($action == 'delete') {
                    $result = $api->deleteCampaign($id);
                }else {
                    $data = $api->getPostData(true);  
                    if ($action == 'add') {
                        $result = $api->addCampaign($data);               
                    }elseif ($action == 'edit') {
                        $result = $api->editCampaign($id, $data);
                    }
                }
            }elseif ($action == 'list') {
                $result = $api->showCampaignList();
            }elseif ($action == 'get' && $id) {
                $result = $api->getCampaign($id);
            }elseif ($action == 'stat') {
                $result = $api->fetchCampaignStat($id);
            }elseif ($action == 'export') {
                $api->exportCampaignPeople($id);
            }
        }elseif ($model == 'task') {
            if ($action == 'get') {
                $result = $api->getTask();
            }
        }elseif ($model == 'invitation') {
            if ($action == 'sent' && $id) {
                $result = $api->markInvitationAsSent($id, $id2);
            }elseif ($action == 'error' && $id) {
                $result = $api->setInvitationError($id, $id2);
            }elseif ($action == 'latest') {
                $result = $api->getInvitationsCheckTime();
            }elseif ($action == 'sync') {
                $result = $api->syncUserInvates($api->getPostData(true));
            }elseif ($action == 'withdraw') {
                $result = $api->withdrawInvitation($id);
            }
        }elseif ($model == 'message') {
            if ($action == 'sync') {
                $result = $api->syncUserMessages($api->getPostData(true));
            }elseif ($action == 'sent') {
                $result = $api->addFollowupLog($id, $id2, $api->getPostData());
            }elseif ($action == 'latest') {
                $result = $api->getMessageCheckTime();
            }
        }elseif ($model == 'attachment') {
            if ($action == 'add') {
                $result = $api->saveFile($_FILES);
            }elseif ($action == 'delete') {
                $result = $api->deleteFile($api->getPostData(true));
            }
        }elseif ($model == 'profile') {
            if ($action == 'edit') {
                $result = $api->editProfile($id, $api->getPostData(true));
            }elseif ($action == 'in_work') {
                $result = $api->setProfileInWork($id);
            }elseif ($action == 'delete') {
                $result = $api->deleteCampaignProfile($id, $id2);
            }
        }elseif ($model == 'limit') {
            if ($action == 'update') {
                $result = $api->updateLimit($api->getPostData(true));
            }
        }
    }
}catch(Exception $e) {
    exit(json_encode(['success' => 0, 'errors' => [[$e->getMessage()]]]));
}

exit(json_encode($result));


class Api {
    private $_db;
    private $_user;
    private $_userId;
    private $_defaultPlanId = 1;
    
    function __construct() {
        $this->_db = new SafeMySQL(array('host' => DB_HOST, 'user' => DB_USER, 'pass' => DB_PASSWORD, 'db' => DB_DATABASE));  
        $this->_db->query("SET NAMES utf8mb4");
    }
    
    public function checkUser() {
        $sessionId = $this->getSessionId();
        if (!$sessionId) {
            throw new Exception('Authorization failed');
        }
        $user = $this->findUser(['session_id' => $sessionId]);
        if (!$user) {
            throw new Exception('User not found');
        }
        $this->_user = $user;
        if ($this->_user['plan']) {
            $this->_user['plan'] = json_decode($this->_user['plan'], true);
            if ($this->_user['plan']['expire'] < time()) {
                $this->_user['plan'] = null;
            }
        }
        $this->_userId = $user['id'];  
    }
    
    public function getUser() {
        $sql = "SELECT `username`, `email`, `created_at` FROM `user` WHERE `id` = $this->_userId";
        $return = $this->_db->getRow($sql);
        if (!$return) {
            $return = ['success' => 0];
        }else {
            $return['success'] = 1;
            $return['plan'] = $this->getPlan();
        }
        return $return;
    }
    
    public function addCampaign(array $campaign) {
        $errors = [];
        $userCampaignList = $this->getCampaignList(['user_id' => $this->_userId]); 
        $plan = $this->getPlan();
        if (count($userCampaignList) >= $plan['campaigns']) {
            return ['success' => 0, 'errors' => ['Sorry you cannot create more campaigns. Please change plan']];
        }
        if (!trim($campaign['name'])) {
            $errors[] = 'Campaign name is empty';
        }
        $campaign['name'] = trim($campaign['name']);
        if (!isset($campaign['people']) || !count($campaign['people'])) {
            $errors[] = 'Campaign profile list is empty';
        }
        if ($this->isCampaignExists($campaign['name'], $this->_userId)) {
            $errors[] = 'Campaign already exists. Try different campaign name';
        }      
        if (!count($errors)) {
            $entityIds = array_column($campaign['people'], 'entity_id');
            if (!isset($campaign['allow_duplicate'])) {
                $existingEntityIds = $this->checkIfProfilesExist($entityIds);
                if (count($existingEntityIds)) {
                    return ['success' => 0, 'errors' => ['Some of profiles already exist for other campaign. Confirm if you want to add them anyway or click Cancel to review'], 'entity_ids' => $existingEntityIds];
                }
            }
            $campaign['people'] = array_combine($entityIds, array_values($campaign['people']));
            $campaignMessages = $campaign['messages'];
            $campaignData = ['name' => $campaign['name'], 'user_id' => $this->_userId, 'connection_message' => isset($campaignMessages['connection']) && $campaignMessages['connection']?$campaignMessages['connection']:null, 
                'keep_sending_messages' => isset($campaignMessages['keep_sending_messages'])?$campaignMessages['keep_sending_messages']:0, 'created_at' => time()];
            $campaignId = $this->insertCampaign($campaignData);
            if (isset($campaign['messages']['followup'])) {
                $sortOrder = 1;
                foreach ($campaign['messages']['followup'] as $followUp) {
                    if (trim($followUp['message'])) {
                        $followUp['sort_order'] = $sortOrder;
                        $followUp['campaign_id'] = $campaignId;
                        $this->insertFollowUp($followUp);                            
                        $sortOrder ++;
                    }
                }
            }
            $profileIds = [];
            foreach ($campaign['people'] as $profile) {    
                if (isset($profile['entity_id'])) {
                    $profileId = $this->insertProfileIfNotExists($profile);
                    if ($profileId) {
                        $profileIds[] = $profileId;
                    }
                }
            }
            $profileIds = array_unique($profileIds);
            if (count($profileIds)) {
                $this->insertCampaignProfiles($campaignId, $profileIds);
            }
            return ['success' => 1, 'campaign_id' => $campaignId, 'count' => count($userCampaignList) + 1];
        }else {
            return ['success' => 0, 'errors' => $errors];
        }
    }
    
    public function editCampaign($campaignId, array $data) {
        $this->checkCampaignPermission($campaignId);
        $errors = [];
        $response = [];
        if (isset($data['messages'])) {
            $update = ['connection_message' => isset($data['messages']['connection']) && $data['messages']['connection']?$data['messages']['connection']:null, 'keep_sending_messages' => $data['messages']['keep_sending_messages']];
            $this->updateCampaign($campaignId, $update);
            $existingFollowUppList = $this->getFollowUpList(['id'], ['campaign_id' => $campaignId]);
            $followupIds = array_keys($existingFollowUppList);
            if (isset($data['messages']['followup'])) {
                $followupCount = count($existingFollowUppList);
                $sortOrder = 1;
                foreach ($data['messages']['followup'] as $followUp) {
                    $followUp['sort_order'] = $sortOrder;
                    if (isset($followUp['id']) && $followUp['id']) {
                        $this->updateFollowUp($followUp['id'], $followUp);  
                        unset($existingFollowUppList[$followUp['id']]);
                    }else {
                        if (trim($followUp['message'])) {
                            if ($followupCount <= MAX_FOLLOWUP_CAMPAIGN) {
                                $followUp['campaign_id'] = $campaignId;
                                $this->insertFollowUp($followUp); 
                                $followupCount ++;
                            }
                        }
                    }
                    $sortOrder ++;
                }
            }
            foreach (array_keys($existingFollowUppList) as $followUpId) {
                $this->deleteFollowUp($followUpId);
            }
            if (count($followupIds)) {
                $this->deleteNonExistAttachments($followupIds);
            }
        }
        if (isset($data['people'])) {
            $data['people'] = array_combine(array_column($data['people'], 'entity_id'), array_values($data['people']));
            $profileIds = [];
            foreach ($data['people'] as $profile) {
                if (isset($profile['entity_id'])) {
                    $profileId = $this->insertProfileIfNotExists($profile);
                    if ($profileId) {
                        $profileIds[] = $profileId;
                    }
                }
            }
            $profileIds = array_unique($profileIds);
            $this->insertCampaignProfiles($campaignId, $profileIds);
        }
        if (isset($data['active'])) {
            $active = (int)$data['active']?1:0;
            $this->updateCampaign($campaignId, ['active' => $active]);
            $response['campaign_active'] = $active;
        }
        if (count($errors)) {
            return ['success' => 0, 'errors' => $errors];
        }else {
            $response['success'] = 1;
            $response['campaign'] = $this->getCampaign($campaignId);
            return $response;
        }
    }
    
    public function deleteCampaign($campaignId) {
        $this->checkCampaignPermission($campaignId);
        $sql = "SELECT `profile_id` FROM `campaign_profile` WHERE `campaign_id` = ?i";
        $profileIds = array_column($this->_db->getAll($sql, $campaignId), 'profile_id');
        if (count($profileIds)) {
            $sql = "DELETE FROM `user_profile` WHERE `user_id` = $this->_userId AND `profile_id` IN (". implode(',', $profileIds). ")";
            $this->_db->query($sql);
        }
        $sql = "DELETE FROM `campaign_profile` WHERE `campaign_id` = ?i";
        $this->_db->query($sql, $campaignId);
        $sql = "SELECT `id` FROM `followup` WHERE `campaign_id` = ?i";           
        $followupIds = array_column($this->_db->getAll($sql, $campaignId), 'id');
        if (count($followupIds)) {
            $sql = "SELECT `id`, `file` FROM `attachment` WHERE `followup_id` IN (". implode(',', $followupIds). ")";
            foreach ($this->_db->getAll($sql) as $row) {
                $attachmentPath = MEDIA_DIR. '/'. $row['file'];
                if (file_exists($attachmentPath)) {
                    unlink($attachmentPath);
                }
                $sql = "DELETE FROM `attachment` WHERE `id` = ". $row['id'];
                $this->_db->query($sql);
            }
            $sql = "DELETE FROM `followup_profile` WHERE `followup_id` IN (". implode(',', $followupIds). ")";
            $this->_db->query($sql);
            $sql = "DELETE FROM `followup` WHERE `campaign_id` = ?i";
            $this->_db->query($sql, $campaignId);
        }
        $sql = "DELETE FROM `campaign` WHERE `id` = ?i";
        $this->_db->query($sql, $campaignId);  
        
        return ['success' => 1];
    }
    
    public function showCampaignList() {
        $campaignList = [];
        foreach ($this->getCampaignList(['user_id' => $this->_userId]) as $campaignId => $row) {
            $campaignList[] = ['id' => $campaignId, 'active' => $row['active'], 'name' => $row['name']];
        }
        $plan = $this->getPlan();
        $progress = ['invite' => $this->getInvitationsCount(24), 'message' => $this->getMessagesCount(24)];
        return ['campaign_list' => $campaignList, 'total' => count($campaignList), 'limit' => $plan['campaigns'], 'progress' => $progress];
    }
    
    public function getCampaign($campaignId) {
        $this->checkCampaignPermission($campaignId);
        $sql = "SELECT `name`, `connection_message`, `keep_sending_messages`, `active` FROM `campaign` WHERE `id` = ?i";
        $campaign = $this->_db->getRow($sql, $campaignId);
        if ($campaign) {
            $campaign['messages'] = ['connection' => $campaign['connection_message'], 'keep_sending_messages' => $campaign['keep_sending_messages'], 'followup' => []];
            unset($campaign['connection_message']);
            unset($campaign['keep_sending_messages']);
            $sql = "SELECT `id`, `message`, `days_after_previous` AS `send_in_days`, `send_immediately_when_replied` FROM `followup` WHERE `campaign_id` = ?i ORDER BY `sort_order` ASC";
            foreach ($this->_db->getAll($sql, $campaignId) as $row) {
                $row['attachments'] = $this->getAttachments(['followup_id' => $row['id']], 'url');
                $campaign['messages']['followup'][] = $row;
            }
            $campaign['profiles'] = [];
            $sql = "SELECT p.id, p.entity_id, up.public_id, up.thread_id, up.invitation_id, up.first_name, up.last_name, up.company, up.job_title, up.picture, up.custom_snippet_1, up.custom_snippet_2, up.custom_snippet_3, up.invitation_sent_at, up.accepted_at FROM `profile` AS `p`
                 JOIN `user_profile` AS `up` ON up.profile_id = p.id AND up.user_id = $this->_userId
                 JOIN `campaign_profile` AS `cp` ON cp.profile_id = p.id
                 WHERE cp.campaign_id = ?i GROUP BY p.id ORDER BY p.id ASC";

            foreach ($this->_db->getAll($sql, $campaignId) as $row) {
                $campaign['profiles'][] = $row;
            }
            $campaign['stat'] = $this->getCampaignStat($campaignId);
            $plan = $this->getPlan();
            $campaign['plan'] = $plan;
            $campaign['limits'] = ['invite' => !is_null($this->_user['invitations_limit'])?$this->_user['invitations_limit']:$plan['invitations'], 'message' => !is_null($this->_user['messages_limit'])?$this->_user['messages_limit']:$plan['messages']];
        }
        
        return $campaign;
    }

    public function exportCampaignPeople($campaignId) {
        $this->checkCampaignPermission($campaignId);

        $sql = "SELECT `name` FROM `campaign` WHERE `id` = ?i";
        $tempDir = TEMP_DIR. '/'. $this->_userId;
        if (!file_exists($tempDir)) {
            mkdir($tempDir, 0777, true);
        }
        $fPath = $tempDir. '/'. $this->totranslit($this->_db->getOne($sql, $campaignId)). '_'. date('Y-m-d'). '.csv';

        $sql = "SELECT COUNT(*) FROM `followup` WHERE `campaign_id` = ?i";
        $followupsTotalCount = $this->_db->getOne($sql, $campaignId);

        $sql = "SELECT p.entity_id, up.public_id, up.first_name, up.last_name, up.company, up.job_title, up.custom_snippet_1, up.custom_snippet_2, up.custom_snippet_3, up.invitation_sent_at, up.accepted_at, up.last_respond_at, COUNT(fp.sent_at) AS `message_sent_count` FROM `user_profile` AS `up`
        JOIN `campaign_profile` AS `cp` ON cp.profile_id = up.profile_id
        JOIN `profile` AS `p` ON p.id = cp.profile_id 
        LEFT JOIN `followup_profile` AS `fp` ON fp.profile_id = cp.profile_id 
        WHERE cp.campaign_id = ". mysqli_real_escape_string($this->_db->conn, $campaignId). " AND up.user_id = $this->_userId
        GROUP BY cp.profile_id";

        $fp = fopen($fPath, 'w');
        fputs($fp, $bom =( chr(0xEF) . chr(0xBB) . chr(0xBF) ));
        $headers = ['Link', 'First Name', 'Last Name', 'Company', 'Job Title', 'Custom Snippet 1', 'Custom Snippet 2', 'Custom Snippet 3', 'Invited', 'Accepted', 'Replied', 'Followup sent', 'Finished'];
        fputcsv($fp, $headers, "\t", '"');

        $totalInvitationSent = 0;
        $totalInvitationAccepted = 0;
        $totalReplied = 0;
        $res = mysqli_query($this->_db->conn, $sql);

        while ($row = mysqli_fetch_assoc($res)) {
            $csvRow = [];
            $csvRow[] = 'https://www.linkedin.com/in/'. ($row['public_id']?$row['public_id']:$row['entity_id']);
            foreach (['first_name', 'last_name', 'company', 'job_title', 'custom_snippet_1', 'custom_snippet_2', 'custom_snippet_3'] as $fieldName) {
                $csvRow[] = $row[$fieldName];
            }
            if ($row['invitation_sent_at']) {
                $csvRow[] = 'Y';
                $totalInvitationSent ++;
            }else {
                $csvRow[] = 'N';
            }
            if ($row['accepted_at']) {
                $csvRow[] = 'Y';
                $totalInvitationAccepted ++;
            }else {
                $csvRow[] = 'N';
            }
            if ($row['last_respond_at']) {
                $csvRow[] = 'Y';
                $totalReplied ++;
            }else {
                $csvRow[] = 'N';
            }
            $csvRow[] = $row['message_sent_count']. ' of '. $followupsTotalCount;
            $csvRow[] = $row['message_sent_count'] >= $followupsTotalCount?'Y':'N';
            fputcsv($fp, $csvRow, "\t", '"');
        }

        for ($i = 0; $i <= 1; $i ++) {
            fputcsv($fp, [''], "\t", '"');
        }

        fputcsv($fp, ['Total invitations sent:', $totalInvitationSent], "\t", '"');
        fputcsv($fp, ['Total connected:', $totalInvitationAccepted], "\t", '"');
        fputcsv($fp, ['Total replied:', $totalReplied], "\t", '"');

        fclose($fp);

        header('HTTP/1.1 200 OK');
        header('Date: ' . date ('D M j G:i:s T Y' ));
        header('Last-Modified: ' . date ( 'D M j G:i:s T Y'));
        header('Content-Type: application/vnd.ms-excel') ;
        header("Content-Disposition: attachment;filename=". basename($fPath));
        echo mb_convert_encoding(file_get_contents($fPath), 'UCS-2LE', 'UTF-8');
        unlink($fPath);
        exit();
    }

    public function getTask() {       
        $return = ['invite' => [], 'followup' => [], 'limits' => [], 'progress' => []];
        $userCampaignList = $this->getCampaignList(['user_id' => $this->_userId, 'active' => 1]);        
        if (!count($userCampaignList)) {
            return ['success' => 0, 'errors' => ['You have no active campaigns']];
        }
        $userCampaignIds = array_keys($userCampaignList);
        if (!count($userCampaignIds)) {
            return $return;
        }
              
        $plan = $this->getPlan();
        if (!$plan) {
            return ['success' => 0, 'errors' => ['Plan not found']];
        }

        $return['progress']['invite'] = $this->getInvitationsCount(24);
        if ($return['progress']['invite'] >= $plan['invitations']) {
            $return['limits']['invite'] = $plan['invitations'];
        }

        $return['progress']['message'] = $this->getMessagesCount(24);
        if ($return['progress']['message']  >= $plan['messages']) {
            $return['limits']['message'] = $plan['messages'];
        }
        
        if (!isset($return['limits']['invite'])) {            
            $sql = "SELECT MAX(`invitation_sent_at`) FROM `user_profile` WHERE `user_id` = $this->_userId";
            $lastInvitationSent = $this->_db->getOne($sql);     
            $includeInvitations = $lastInvitationSent?(time() - $lastInvitationSent > INVITATION_DELAY):true;

            if ($includeInvitations) {
                $sql = "SELECT cp.campaign_id, MAX(`invitation_sent_at`) AS `latest_invitation_sent` FROM `user_profile` AS `up`
                JOIN `campaign_profile` AS `cp` ON cp.profile_id = up.profile_id
                WHERE `user_id` = $this->_userId AND `campaign_id` IN (?a) GROUP BY cp.campaign_id ORDER BY `latest_invitation_sent` ASC";
                $campaignIdsSorted = array_column($this->_db->getAll($sql, $userCampaignIds), 'campaign_id');

                if (count($campaignIdsSorted)) {
                    $sql = "SELECT c.id AS `campaign_id`, c.connection_message, p.id AS `profile_id`, p.entity_id, up.public_id, up.first_name, up.last_name, up.company, up.custom_snippet_1, up.custom_snippet_2, up.custom_snippet_3 FROM `campaign` AS `c`
                    JOIN `campaign_profile` AS `cp` ON cp.campaign_id = c.id
                    JOIN `profile` AS `p` ON p.id = cp.profile_id
                    JOIN `user_profile` AS `up` ON up.profile_id = p.id AND up.user_id = $this->_userId
                    WHERE c.id IN (?a) AND c.active = 1 AND (up.invitation_sent_at IS NULL OR up.invitation_sent_at = 0) AND (up.accepted_at IS NULL OR up.accepted_at = 0) AND (up.invitation_error IS NULL OR up.invitation_error = 0) ORDER BY FIELD (c.id, ". (implode(',', $campaignIdsSorted)). "), p.id ASC LIMIT 1";
                    $row = $this->_db->getRow($sql, $userCampaignIds);
                    if ($row) {
                        $return['invite'] = [$row];
                    }
                }
            }
        }

        if (!isset($return['limits']['message'])) { 
            $existingProfileFollowUps = [];
            $sql = "SELECT fp.followup_id, fp.profile_id, fp.sent_at, fp.success, fp.error FROM `followup_profile` AS `fp`
            JOIN `followup` AS `f` ON f.id = fp.followup_id 
            WHERE f.campaign_id IN (?a) AND fp.sent_at IS NOT NULL";
        
            $latestMessageSent = 0;
            foreach ($this->_db->getAll($sql, $userCampaignIds) as $row) {
                $messageSentAt = $row['sent_at'];
                if (!$row['success'] && time() - $messageSentAt > 7200) {
                    continue; //Will send again message not successfullly sent before
                }
                $existingProfileFollowUps[$row['followup_id']][$row['profile_id']] = $row;
                if ($messageSentAt > $latestMessageSent) {
                    $latestMessageSent = $messageSentAt;
                }
            }

            $includeMessages = $latestMessageSent > 0?(time() - $latestMessageSent > MESSAGES_DELAY):true;       
            if ($includeMessages) {
                $sql = "SELECT `id`, `campaign_id`, `message`, `days_after_previous`, `send_immediately_when_replied` FROM `followup` WHERE `campaign_id` IN (?a) ORDER BY `sort_order` ASC";
                $followUps = [];
                foreach ($this->_db->getAll($sql, $userCampaignIds) as $row) {
                    $row['attachments'] = array_values($this->getAttachments(['followup_id' => $row['id']], 'url'));
                    $followUps[] = $row;
                }

                $sql = "SELECT f.campaign_id, MAX(fp.sent_at) AS `latest_message_sent` FROM `followup` AS `f`
                JOIN `followup_profile` AS `fp` ON fp.followup_id = f.id
                WHERE f.campaign_id IN (?a) GROUP BY f.campaign_id ORDER BY `latest_message_sent` ASC";
                $campaignIdsSorted = array_column($this->_db->getAll($sql, $userCampaignIds), 'campaign_id');

                if (count($campaignIdsSorted)) {
                    $sql = "SELECT p.id, p.entity_id, up.public_id, up.first_name, up.last_name, up.company, up.custom_snippet_1, up.custom_snippet_2, up.custom_snippet_3, cp.campaign_id, up.accepted_at, up.last_respond_at FROM `campaign_profile` AS `cp`
                    JOIN `profile` AS `p` ON p.id = cp.profile_id 
                    JOIN `user_profile` AS `up` ON up.profile_id = p.id AND up.user_id = $this->_userId
                    WHERE cp.campaign_id IN (?a) AND (up.accepted_at IS NOT NULL AND up.accepted_at > 0) AND (up.sent_in_work_at IS NULL OR (" . time() . " - up.sent_in_work_at) > " . SAME_PERSON_MESSAGES_DELAY . ") ORDER BY FIELD (cp.campaign_id, " . (implode(',', $campaignIdsSorted)) . "), p.id ASC";

                    $profiles = $this->_db->getAll($sql, $userCampaignIds);
                    $followupList = [];
                    foreach ($profiles as $profileRow) {
                        $sendTime = $previousFollowUpSentAt = null;
                        $acceptedAt = $profileRow['accepted_at'];
                        foreach ($followUps as $followupRow) {
                            if ($followupRow['campaign_id'] != $profileRow['campaign_id']) {
                                continue;
                            }
                            if ($profileRow['last_respond_at'] && !$userCampaignList[$profileRow['campaign_id']]['keep_sending_messages']) {
                                break;
                            }
                            if (isset($existingProfileFollowUps[$followupRow['id']][$profileRow['id']])) {
                                $existingProfileFollowUpRow = $existingProfileFollowUps[$followupRow['id']][$profileRow['id']];
                                $previousFollowUpSentAt = $existingProfileFollowUpRow['sent_at'];
                                $sendError = $existingProfileFollowUpRow['error'];
                                if ($sendError) {
                                    break;
                                }
                            } else {
                                if ($followupRow['send_immediately_when_replied'] && $previousFollowUpSentAt && $profileRow['last_respond_at'] && $profileRow['last_respond_at'] > $previousFollowUpSentAt) {
                                    $sendTime = $profileRow['last_respond_at'];
                                } else {
                                    $sendTime = ($previousFollowUpSentAt ? $previousFollowUpSentAt : $acceptedAt) + $followupRow['days_after_previous'] * 24 * 3600;
                                }
                                if ($sendTime <= time()) {
                                    $followupList[$followupRow['campaign_id']][] = ['profile_id' => $profileRow['id'], 'public_id' => $profileRow['public_id'], 'followup_id' => $followupRow['id'], 'message' => $followupRow['message'], 'entity_id' => $profileRow['entity_id'], 'first_name' => $profileRow['first_name'],
                                        'last_name' => $profileRow['last_name'], 'full_name' => $profileRow['first_name'] . ' ' . $profileRow['last_name'], 'company' => $profileRow['company'], 'custom_snippet_1' => $profileRow['custom_snippet_1'], 'custom_snippet_2' => $profileRow['custom_snippet_2'], 'custom_snippet_3' => $profileRow['custom_snippet_3'], 'attachments' => $followupRow['attachments'], 'send_at' => $sendTime];
                                }
                                break;
                            }
                        }
                    }
                    if (count($followupList)) {
                        $followupList = array_shift($followupList);
                        $sendTimes = array_column($followupList, 'send_at');
                        asort($sendTimes);
                        $return['followup'][] = $followupList[array_keys($sendTimes)[0]];
                    }
                }
            }
        }      
        
        $return['success'] = 1;
        
        return $return;        
    }
    
    public function syncUserMessages(array $timeLog) {
        if (count($timeLog)) {
            $sql = "SELECT `id`, `entity_id` FROM `profile` WHERE `entity_id` IN ( ?a )";
            foreach ($this->_db->getAll($sql, array_keys($timeLog)) as $row) {
                $lastRespondAt = $timeLog[$row['entity_id']]['created_at'];
                $threadId = isset($timeLog[$row['entity_id']]['thread_id'])?$timeLog[$row['entity_id']]['thread_id']:Null;
                $sql = "INSERT INTO `user_profile` (`user_id`, `profile_id`, `thread_id`, `last_respond_at`) VALUES ( ?i, ?i, ?s, ?s ) ON DUPLICATE KEY UPDATE `thread_id` = ?s, `last_respond_at` = ?s";
                $this->_db->query($sql, $this->_userId, $row['id'], $threadId, $lastRespondAt, $threadId, $lastRespondAt);
            }
        }
        $sql = "UPDATE `user` SET `messages_checked_at` = ?i WHERE `id` = $this->_userId";
        $this->_db->query($sql, time());
        return ['success' => 1];
    }
    
    public function addFollowupLog($followupId, $profileId, array $sent) {
        $followup = $this->getFollowup($followupId);
        if (!$followup) {
            throw new Exception('Followup message not found');
        }
        $this->checkCampaignPermission($followup['campaign_id']);
        $insert = ['followup_id' => $followupId, 'profile_id' => $profileId, 'sent_at' => time()];
        $insert['error'] = Null;
        $insert['success'] = 0;
        if (count($sent)) {
            $insert['success'] = 1;
            if (isset($sent['error'])) {
                $insert['error'] = (int)$sent['error'];
            }
        }
        $sql = "INSERT INTO `followup_profile` SET ?u ON DUPLICATE KEY UPDATE `success` = ?i, `error` = ?i, `sent_at` = '". time(). "'";
        $this->_db->query($sql, $insert, $insert['success'], $insert['error']);
        if (isset($sent['thread_id']) && $sent['thread_id']) {
            $sql = "UPDATE `user_profile` SET `thread_id` = ?s WHERE `profile_id` = ?i AND `user_id` = $this->_userId";
            $this->_db->query($sql, $sent['thread_id'], $profileId); 
        }
        return ['success' => 1];
    }
    
    public function markInvitationAsSent($profileId, $invitationId = null) {
        $invitationSentAt = time();
        if (!$invitationId) {
            // if user has been already connected, set invitation time as week before to not affect the limits
            $invitationSentAt -= 3600 * 24 * 7;
        }
        $insert = ['user_id' => $this->_userId, 'profile_id' => $profileId, 'invitation_sent_at' => $invitationSentAt];
        $update = ['invitation_sent_at' => $invitationSentAt];
        if ($invitationId) {
            $insert['invitation_id'] = $invitationId;
            $update['invitation_id'] = $invitationId;
        }
        $sql = "INSERT INTO `user_profile` SET ?u ON DUPLICATE KEY UPDATE ?u";
        $this->_db->query($sql, $insert, $update);        
        return ['success' => 1];
    }
    
    public function setInvitationError($profileId, $errorId) {
        $sql = "UPDATE `user_profile` SET `invitation_error` = ?i WHERE `user_id` = $this->_userId AND `profile_id` = ?i";
        $this->_db->query($sql, $errorId, $profileId);
    }
    
    public function getInvitationsCheckTime() {
        $sql = "SELECT IFNULL(`invites_checked_at`, `created_at`) FROM `user` WHERE `id` = $this->_userId";
        $checkedAt = $this->_db->getOne($sql);
        $since = $checkedAt && $checkedAt > 0?time() - $checkedAt:0;
        return ['timestamp' => $checkedAt, 'since' => $since];
    }
    
    public function getMessageCheckTime() {
        $sql = "SELECT IFNULL(`messages_checked_at`, `created_at`) FROM `user` WHERE `id` = $this->_userId";
        $checkedAt = $this->_db->getOne($sql);
        $since = $checkedAt && $checkedAt > 0?time() - $checkedAt:0;
        return ['timestamp' => $checkedAt, 'since' => $since];
    }
    
    public function fetchCampaignStat($campaignId) {
        $this->checkCampaignPermission($campaignId);
        $stat = $this->getCampaignStat($campaignId);
        if ($stat) {
            $stat['success'] = 1;
            return $stat;
        }else {
            return ['success' => 0];
        }
    }
        
    public function syncUserInvates(array $timeLog) {
        if (count($timeLog)) {
            $sql = "SELECT p.id, p.entity_id, up.accepted_at FROM `profile` AS `p` 
            JOIN `user_profile` AS `up` ON up.profile_id = p.id AND up.user_id = $this->_userId
            WHERE p.entity_id IN ( ?a ) AND up.accepted_at IS NULL";
            foreach ($this->_db->getAll($sql, array_keys($timeLog)) as $row) {
                $publicId = $timeLog[$row['entity_id']]['public_id'];
                $acceptedAt = $timeLog[$row['entity_id']]['accepted_at'];
                if (!$acceptedAt) {
                    $acceptedAt = time();
                }               
                $sql = "INSERT INTO `user_profile` (`user_id`, `profile_id`, `public_id`, `accepted_at`) VALUES ( ?i, ?i, ?s, ?s ) ON DUPLICATE KEY UPDATE  `public_id` = ?s, `accepted_at` = ?s";
                $this->_db->query($sql, $this->_userId, $row['id'], $publicId, $acceptedAt, $publicId, $acceptedAt);
            }
        }
        $sql = "UPDATE `user` SET `invites_checked_at` = ?i WHERE `id` = $this->_userId";
        $this->_db->query($sql, time());
        return ['success' => 1];
    }
    
    public function withdrawInvitation($profileId) {
        $errors = [];
        $sql = "SELECT `id`, `accepted_at` FROM `user_profile` WHERE `user_id` = $this->_userId AND `profile_id` = ?i";
        $row = $this->_db->getRow($sql, $profileId);
        if ($row) {
            if (!$row['accepted_at']) {
                $sql = "UPDATE `user_profile` SET `invitation_sent_at` = NULL, `invitation_id` = NULL WHERE `id` = ?i";
                $this->_db->query($sql, $row['id']);
                return ['success' => 1];
            }else {
                $errors[] = 'Cannot withdraw. Invitation is already accepted.';
            }
        }else {
            $errors[] = 'Profile is not found';
        }
        return ['success' => 0, 'errors' => $errors];
    }
    
    public function saveFile(array $files) {
        if (count($files)) {
            $file = array_shift($files);
            $file['name'] = trim(preg_replace('/\?.*$/', '', $file['name']));
            $pathinfo = pathinfo($file['name']);
            $extension = strtolower($pathinfo['extension']);
            if (in_array($extension, ['jpg', 'jpeg', 'gif', 'png', 'tiff', 'ai', 'psd', 'pdf', 'doc', 'docx', 'csv', 'zip', 'rar', 'ppt', 'pptx', 'pps', 'ppsx', 'odt', 'rtf', 'xls', 'xlsx', 'txt', 'pub', 'html', '7z', 'eml'])) {            
                $newFileDir = MEDIA_DIR. '/'. $this->_userId. '/'. rand(1, 100);
                if (!file_exists($newFileDir)) {
                   mkdir($newFileDir, 0777, true);
                }
                $newFilePath = $newFileDir. '/'. $file['name'];
                copy($file['tmp_name'], $newFilePath);
                if (file_exists($newFilePath)) {
                    return ['success' => 1, 'url' => $this->getAttachmentUrl($newFilePath)];
                }            
            }
        }
        return ['success' => 0];
    }
    
    public function deleteFile(array $data) {
        if (isset($data['url'])) {
            $filePath = str_replace($this->serverProtocol(). $_SERVER['HTTP_HOST'], MAIN_PATH, $data['url']);
            if (file_exists($filePath)) {
                unlink($filePath);
            }
        }
        return ['success' => 1];
    }   
    
    public function editProfile($profileId, array $data) {
        $upd = [];
        foreach (['entity_id', 'first_name', 'last_name', 'company', 'custom_snippet_1', 'custom_snippet_2', 'custom_snippet_3'] as $fieldName) {
            if (isset($data[$fieldName])) {
                $upd[$fieldName] = $data[$fieldName]?$data[$fieldName]:NULL;
            }
        }
        if (count($upd)) {
            $sql = "UPDATE `user_profile` SET ?u WHERE `user_id` = $this->_userId AND `profile_id` = $profileId";
            $this->_db->query($sql, $upd);
        }
        return ['success' => 1];
    }
    
    public function deleteCampaignProfile($campaignId, $profileId) {
        if ($campaignId && $profileId) {
            $this->checkCampaignPermission($campaignId);
            $sql = "DELETE FROM `campaign_profile` WHERE `campaign_id` = ?i AND `profile_id` = ?i";
            $this->_db->query($sql, $campaignId, $profileId);

            $userCampaignIds = array_keys($this->getCampaignList(['user_id' => $this->_userId]));
            $sql = "SELECT `id` FROM `campaign_profile` WHERE `profile_id` = ?i AND `campaign_id` != ?i AND `campaign_id` IN ( ?a ) LIMIT 1";
            if (!$this->_db->getOne($sql, $profileId, $campaignId, $userCampaignIds)) {
                $sql = "DELETE FROM `user_profile` WHERE `user_id` = $this->_userId AND `profile_id` = ?i AND (`invitation_sent_at` IS NULL OR `invitation_sent_at` < ". (time() - 3600 * 24). ")";
                $this->_db->query($sql, $profileId);
            }
            return ['success' => 1];
        }
        return ['success' => 0];
    }
    
    public function setProfileInWork($profileId) {
        $sql = "UPDATE `user_profile` SET `sent_in_work_at`  = ". time(). " WHERE `user_id` = $this->_userId AND `profile_id` = $profileId";
        $this->_db->query($sql);
        return ['success' => 1];
    }
    
    public function login(array $data) {
        $errors = [];
        if (!isset($data['email']) || !isset($data['password'])) {
            $errors[] = 'Something is missing';
        }else {
            $sql = "SELECT `id` FROM `user` WHERE `email` = ?s AND `password` = ?s";
            $user = $this->findUser(['email' => $data['email'], 'password' => $data['password']]);
            if (!$user) {
                $errors[] = 'Account not found. Please check email and password.';
            }else {
                $sessionId = $this->generateSessionId($user['id']);
                if (!$sessionId) {
                    $errors[] = "Couldn't generate user session. Please try later";
                }else {
                    $sql = "UPDATE `user` SET `session_id` = ?s WHERE `id` = ?i";
                    $this->_db->query($sql, $sessionId, $user['id']);
                    return ['success' => 1, 'session_id' => $sessionId];
                }
            }
        }
        return ['success' => 0, 'errors' => $errors];
    }
    
    public function register(array $data) {
        $errors = [];
        foreach (['email', 'username', 'password'] as $fieldName) {
            if (!isset($data[$fieldName]) || !trim($data[$fieldName])) {
                $errors[] = 'Something is missing';
                break;
            }else {
                $data[$fieldName] = trim($data[$fieldName]);
            }
        }
        if (!count($errors)) {
            $user = $this->findUser(['email' => $data['email']]);
            if ($user) {
                $errors[] = 'Email already exists. Please choose another one';
            }else {
                session_start();
                $confirmationCode = $this->generateRandomCode();
                if ($this->sendEmail($data['email'], "Your confimation code", "Confirmation code: $confirmationCode")) {
                    $_SESSION['email'] = $data['email'];
                    $_SESSION['username'] = $data['username'];
                    $_SESSION['password'] = $data['password'];
                    $_SESSION['code'] = $confirmationCode;
                    return ['success' => 1, 'session_id' => session_id()];
                }else {
                    $errors[] = 'Something is wrong. Please try later';
                }               
            }
        }
        return ['success' => 0, 'errors' => $errors];
    }    
    
    public function confirmRegistration(array $data) {
        $errors = [];
        if (!isset($data['code']) || !$data['code']) {
            $errors[] = 'Confirmation code is missing';
        }else {
            session_start();
            if ($_SESSION['code'] == $data['code']) {
                foreach (['email', 'username', 'password'] as $fieldName) {
                    if (!isset($_SESSION[$fieldName]) || !trim($_SESSION[$fieldName])) {
                        $errors[] = "$fieldName is missing";
                        break;
                    }else {
                        $_SESSION[$fieldName] = trim($_SESSION[$fieldName]);
                    }
                }
                if (!count($errors)) {
                    if ($userId = $this->createUser($_SESSION)) {
                        return ['success' => 1, 'user_id' => $userId];
                    }else {
                        $errors[] = 'Something is wrong. Please try again later';     
                    }            
                }
            }else {
                $errors[] = 'Wrong code. Please enter correct one';
            }
        }
        return ['success' => 0, 'errors' => $errors];
    }
    
    public function resetPassword(array $data) {
        $errors = [];
        if (!isset($data['email']) || !$data['email']) {
            $errors[] = 'Email address is missing';
        }else {
            $user = $this->findUser(['email' => $data['email']]);
            if (!$user) {
                $errors[] = 'Email does not exists';
            }else {
                session_start();
                $_SESSION['email'] = $data['email'];
                $_SESSION['code'] = $this->generateRandomCode();          
                if ($this->sendEmail($data['email'], "Your reset password code", "Reset password code: ". $_SESSION['code'])) {
                    return ['success' => 1];
                }else {
                    $errors[] = 'Something is wrong. Please try again later';  
                }
            }
        }
        return ['success' => 0, 'errors' => $errors];
    }
    
    public function updatePassword(array $data) {
        $errors = [];
        foreach (['code', 'email', 'password'] as $fieldName) {
            if (!isset($data[$fieldName]) || !trim($data[$fieldName])) {
                $errors[] = "$fieldName is missing";
                break;
            }else {
                $data[$fieldName] = trim($data[$fieldName]);
            }
        }
        if (!count($errors)) {
            session_start();
            if ($data['email'] != $_SESSION['email']) {
                $errors[] = 'Emails do not match';
            }elseif ($data['code'] != $_SESSION['code']) {
                $errors[] = 'Incorrect confirmation code';
            }else {
                $user = $this->findUser(['email' => $data['email']]);
                if (!$user) {
                    $errors[] = 'User does not exists';
                }else {
                    $this->updateUser($user['id'], ['password' => $data['password']]);
                    return ['success' => 1];
                }
            }
        }
        return ['success' => 0, 'errors' => $errors];
    }
    
    public function updateLimit(array $data) {
        $errors = [];
        $upd = [];
        if (isset($data['invite'])) {
            $upd['invitations_limit'] = (int)$data['invite'];
        }
        if (isset($data['message'])) {
            $upd['messages_limit'] = (int)$data['message'];
        }
        if (count($upd)) {
            $plan = $this->getPlan();
            if (isset($upd['invitations_limit']) && $plan['invitations'] < $upd['invitations_limit']) {
                $errors[] = 'Invitation limit exceeded. Your limit: '. $plan['invitations']. ' invitations per day. Please change plan';
            }
            if (isset($upd['messages_limit']) && $plan['messages'] < $upd['messages_limit']) {
                $errors[] = 'Messages limit exceeded. Your limit: '. $plan['messages']. ' messages per day. Please change plan';
            }
            if (!count($errors)) {
                $this->updateUser($this->_userId, $upd);
                return ['success' => 1];
            }
        }else {
            $errors[] = 'No changes made';
        }
        return ['success' => 0, 'errors' => $errors];
    }
    
    private function createUser(array $data) {
        $user = ['username' => $data['username'], 'email' => $data['email'], 'password' => $data['password'], 'created_at' => time()];
        $sql = "INSERT INTO `user` SET ?u";
        $this->_db->query($sql, $user);
        return $this->_db->insertId();
    }
    
    private function updateUser($userId, array $data) {
        $sql = "UPDATE `user` SET ?u WHERE `id` = ?i";
        $this->_db->query($sql, $data, $userId);
    }
    
    private function checkIfProfilesExist(array $entityIds) {
        $sql = "SELECT p.entity_id FROM `profile` AS `p`
            JOIN `campaign_profile` AS `cp` ON cp.profile_id = p.id
            JOIN `campaign` AS `c` ON c.id = cp.campaign_id AND c.user_id = $this->_userId
            WHERE p.entity_id IN (?a)";
        return array_column($this->_db->getAll($sql, $entityIds), 'entity_id');
    }
    
    private function getCampaignList(array $filter) {
        $return = [];
        $query = $this->buildSqlQuery('campaign', ['id', 'name', 'active', 'keep_sending_messages'], $filter);
        foreach ($this->_db->getAll($query) as $row) {
            $return[$row['id']] = $row;
        }
        return $return;
    }
    
    private function getPlan() {
        $planId = $this->_user['plan']?$this->_user['plan']['id']:$this->_defaultPlanId;
        $sql = "SELECT * FROM `plan` WHERE `id` = ?i";
        return $this->_db->getRow($sql, $planId);
    }
        
    private function getInvitationsCount($hours = 24) {
        $sql = "SELECT COUNT(*) FROM `user_profile` WHERE `user_id` = $this->_userId AND `invitation_sent_at` >= ". (time() - 3600 * $hours);
        return $this->_db->getOne($sql);
    }
    
    private function getMessagesCount($hours = 24) {
        $campaignIds = array_keys($this->getCampaignList(['user_id' => $this->_userId]));
        $sql = "SELECT COUNT(*) FROM `followup_profile` AS `fp` 
         JOIN `followup` AS `f` ON f.id = fp.followup_id
         WHERE f.campaign_id IN (?a) AND fp.success = 1 AND fp.sent_at >= ". (time() - 3600 * $hours);
        return $this->_db->getOne($sql, $campaignIds);
    }
    
    private function getActiveCampaignsCount() {
        $sql = "SELECT COUNT(*) FROM `campaign` WHERE `user_id` = $this->_userId AND `active` = 1"; 
        return $this->_db->getOne($sql);
    }
    
    private function getFollowUpList(array $fields, array $filter) {
        $return = [];
        $query = $this->buildSqlQuery('followup', $fields, $filter);
        foreach ($this->_db->getAll($query) as $row) {
            $return[$row['id']] = $row;
        }
        return $return;
    }
    
    private function getFollowUpCount($campaignId) {
        $sql = "SELECT COUNT(*) FROM `followup` WHERE `campaign_id` = ?i";
        return $this->_db->getOne($sql, $campaignId);
    }
    
    private function getFollowup($followupId) {
        $sql = "SELECT * FROM `followup` WHERE `id` = ?i";
        return $this->_db->getRow($sql, $followupId);
    }    
    
    private function insertCampaign(array $data) {
        $sql = "INSERT INTO `campaign` SET ?u";
        $this->_db->query($sql, $data);
        return $this->_db->insertId();
    }
    
    private function insertFollowUp($data) {
        $sql = "INSERT INTO `followup` SET ?u";
        $this->_db->query($sql, ['message' => $data['message'], 'days_after_previous' => $data['send_in_days'],
            'campaign_id' => $data['campaign_id'], 'send_immediately_when_replied' => isset($data['send_immediately_when_replied'])?$data['send_immediately_when_replied']:0, 'sort_order' => $data['sort_order']]);
        $followUpId = $this->_db->insertId();  
        if (isset($data['attachments'])) {
            foreach ($data['attachments'] as $attachmentUrl) {
                $attachmentSPath = $this->getAttachmentShortPath($this->getAttachmentPath($attachmentUrl));
                $this->insertAttachment(['file' => $attachmentSPath, 'followup_id' => $followUpId]);
            }
        }
    }
    
    private function updateFollowUp($followUpId, array $data) {
        $sql = "UPDATE `followup` SET ?u WHERE `id` = ?i";
        $this->_db->query($sql, ['message' => $data['message'], 'days_after_previous' => $data['send_in_days'], 'send_immediately_when_replied' => $data['send_immediately_when_replied'], 'sort_order' => $data['sort_order']], $followUpId);
        $existingAttachments = array_flip($this->getAttachments(['followup_id' => $followUpId]));
        foreach ($data['attachments'] as $attachmentUrl) {
            $attachmentSPath = $this->getAttachmentShortPath($this->getAttachmentPath($attachmentUrl));
            if (isset($existingAttachments[$attachmentSPath])) {
                unset($existingAttachments[$attachmentSPath]);
            }else {
                $this->insertAttachment(['file' => $attachmentSPath, 'followup_id' => $followUpId]);
            }
        }
        foreach ($existingAttachments as $attachmentId) {
            $this->deleteAttachment($attachmentId);
        }
    }
    
    private function deleteFollowUp($followUpId) {
        foreach ($this->getAttachments(['followup_id' => $followUpId]) as $attachmentId => $attachmentSPath) {
            $this->deleteAttachment($attachmentId, $attachmentSPath);
        }
        $sql = "DELETE FROM `followup_profile` WHERE `followup_id` = ?i";
        $this->_db->query($sql, $followUpId);
        $sql = "DELETE FROM `followup` WHERE `id` = ?i";
        $this->_db->query($sql, $followUpId);
    }

    private function deleteNonExistAttachments($followupIds) {
        if (!count($followupIds)) {
            return;
        }
        $sql = "SELECT `id`, `file` FROM `attachment` WHERE `followup_id` IN (". implode(',', $followupIds). ")";
        foreach ($this->_db->getAll($sql) as $row) {
            $attachmentPath = MEDIA_DIR. '/'. $row['file'];
            if (!file_exists($attachmentPath)) {
                $sql = "DELETE FROM `attachment` WHERE `id` = ". $row['id'];
                $this->_db->query($sql);
            }
        }
    }
    
    private function getAttachments(array $filter, $mode = null) {
        $return = [];
        $query = $this->buildSqlQuery('attachment', ['id', 'file', 'followup_id'], $filter);
        foreach ($this->_db->getAll($query) as $row) {
            if ($row['file']) {               
                $attachmentPath = MEDIA_DIR. '/'. $row['file'];
                if (file_exists($attachmentPath)) {
                    if ($mode == 'url') {
                        $value = $this->getAttachmentUrl($attachmentPath);                       
                    }else {
                        $value = $row['file'];
                    }
                    $return[$row['id']] = $value;
                }
            }
        }
        return $return;
    }
    
    private function insertAttachment(array $data) {
        $sql = "INSERT INTO `attachment` SET ?u";
        $data['created_at'] = time();
        $this->_db->query($sql, $data);
        return $this->_db->insertId();
    }
    
    private function deleteAttachment($attachmentId, $file = null) {
        if (!$file) {
            $sql = "SELECT `file` FROM `attachment` WHERE `id` = ?i";
            $result = $this->_db->getRow($sql, $attachmentId);
            if ($result) {
                $file = $result['file'];
            }          
        }
        $fPath = MEDIA_DIR. '/'. $file;
        if (file_exists($fPath)) {
            unlink($fPath);
        }
        $sql = "DELETE FROM `attachment` WHERE `id` = ?i";
        $this->_db->query($sql, $attachmentId);
    }
    
    private function insertProfileIfNotExists($profile) {       
        if (!isset($profile['entity_id'])) {
            return;
        }
        $sql = "SELECT `id` FROM `profile` WHERE `entity_id` = ?s";
        $profileId = $this->_db->getOne($sql, $profile['entity_id']);     
        if (!$profileId) {
            $sql = "INSERT INTO `profile` SET `entity_id` = ?s";
            $this->_db->query($sql, $profile['entity_id']);
            $profileId = $this->_db->insertId();      
        }
        $insert = ['profile_id' => $profileId, 'user_id' => $this->_userId];
        foreach (['public_id', 'first_name', 'last_name', 'company', 'job_title', 'picture', 'custom_snippet_1', 'custom_snippet_2', 'custom_snippet_3'] as $fieldName) {
            if (isset($profile[$fieldName]) && trim($profile[$fieldName])) {
                $insert[$fieldName] = trim($profile[$fieldName]);
            }
        }
        $update = [];        
        if (isset($insert['company']) && $insert['company']) {
            $update['company'] = $insert['company'];
        }
        if (isset($insert['job_title']) && $insert['job_title']) {
            $update['job_title'] = $insert['job_title'];
        }
        if (isset($insert['last_name']) && $insert['last_name']) {
            $update['last_name'] = $insert['last_name'];
        }
        if (isset($insert['picture']) && $insert['picture']) {
            $update['picture'] = $insert['picture'];
        }
        if (count($update)) {
            $sql = "INSERT INTO `user_profile` SET ?u ON DUPLICATE KEY UPDATE ?u";
            $this->_db->query($sql, $insert, $update);
        }else {
            $sql = "INSERT INTO `user_profile` SET ?u ON DUPLICATE KEY UPDATE `id` = `id`";
            $this->_db->query($sql, $insert);
        }
        
        return $profileId;
    }
    
    private function insertCampaignProfiles($campaignId, array $profileIds) {
        $insert = [];
        foreach ($profileIds as $profileId) {
            $insert[] = "($campaignId, $profileId)";
        }
        if (count($insert)) {
            $sql = "INSERT INTO `campaign_profile` (`campaign_id`, `profile_id`) VALUES ". implode(',', $insert). ' ON DUPLICATE KEY UPDATE `id` = `id`';
            $this->_db->query($sql);
        }
    }
    
    private function findUser(array $fields) {        
        foreach ($fields as $fieldName => $fieldValue) {
            $where[] = "`$fieldName` = ". $this->_db->escapeString($fieldValue);
        }
        $sql = "SELECT * FROM `user` WHERE ". implode(' AND ', $where);
        return $this->_db->getRow($sql);
        
    }
    
    private function getCampaignStat($campaignId) {        
        $sql = "SELECT IFNULL(SUM(IF(t.sent_at IS NULL, 0, 1)), 0) AS `messages_sent`, COUNT(*) AS `messages_total` FROM (SELECT `sent_at` FROM `followup` AS `f` 
         LEFT JOIN `followup_profile` AS `fp` ON fp.followup_id = f.id
        WHERE f.campaign_id = ?i GROUP BY fp.profile_id) AS `t`";        
        $messagesStat =  $this->_db->getRow($sql, $campaignId);
        $sql = "SELECT IFNULL(SUM(IF(up.invitation_sent_at, 1, 0)), 0) AS `invitations_sent`, IFNULL(SUM(IF(up.accepted_at, 1, 0)), 0) AS `accepted`, IFNULL(SUM(IF(up.last_respond_at, 1, 0)), 0) AS `replied`, COUNT(*) AS `total` FROM `campaign_profile` AS `cp`
            JOIN `user_profile` AS `up` ON up.profile_id = cp.profile_id AND up.user_id = $this->_userId
            WHERE cp.campaign_id = ?i";
        $stat = $this->_db->getRow($sql, $campaignId);
        if ($stat && $messagesStat) {
            $messagesStat['messages_sent'] = (int)$messagesStat['messages_sent'];
            $stat = array_merge($stat, $messagesStat);
        }
        return $stat;
    }
    
    private function isCampaignExists($name, $userId) {
        $sql = "SELECT `id` FROM `campaign` WHERE `name` = ?s AND `user_id` = ?i";
        return $this->_db->getOne($sql, $name, $userId)?true:false;
    }
    
    private function checkCampaignPermission($campaignId) {
        $userCampaigns = $this->getCampaignList(['user_id' => $this->_userId]);
        if (!isset($userCampaigns[$campaignId])) {
            throw new Exception('You have no permission for this campaign');
        }
    }
    
    private function generateSessionId($userId) {
        $sql = "SELECT `id`, `email`,  `password` FROM `user` WHERE `id` = ?i";
        $row = $this->_db->getRow($sql, $userId);
        if ($row) {
            $attempt = 0;
            do {
                $sessionId = md5($row['id']. $row['email']. $row['password']. time(). rand(1, 100000));
                $sql = "SELECT `id` FROM `user` WHERE `session_id` = ?s";  
                $attempt ++;
            }while ($this->_db->getOne($sql, $sessionId) && $attempt < 20);
            
            return $sessionId;
        }else {
            return null;
        }
    }
    
    private function getSessionId() {
        $headers = getallheaders();
        if (isset($headers['connector-session-id'])) {
            return $headers['connector-session-id'];
        }elseif (isset($_GET['connector-session-id'])) {
            return $_GET['connector-session-id'];
        }
        return null;
    }
    
    private function generateRandomCode() {
        $return = null;
        for ($i = 1; $i <= 6; $i ++) {
            $return .= rand(1, 9);            
        }
        return $return;
    }
    
    public function getPostData($required = false) {
        $return = file_get_contents('php://input');
        $return = json_decode($return, true);
        if ($return === null && $required) {
            throw new Exception('Empty input data');
        }
        return $return?$return:[];
    }   
    
    private function updateCampaign($campaignId, array $data) {
        $sql = "UPDATE `campaign` SET ?u WHERE `id` = ?i";
        $this->_db->query($sql, $data, $campaignId);
    }
    
    private function getAttachmentUrl($fPath) {
        return $this->serverProtocol(). $_SERVER['HTTP_HOST']. str_replace(MAIN_PATH, '', $fPath);
    }
    
    private function getAttachmentPath($fUrl) {
        return str_replace($this->serverProtocol(). $_SERVER['HTTP_HOST'], MAIN_PATH, $fUrl);
    }
    
    private function getAttachmentShortPath($fPath) {
        $fPath = str_replace(MEDIA_DIR, '', $fPath);
        $fPath = preg_replace('/^\//', '', $fPath);
        return $fPath;
    }
    
    private function buildSqlQuery($table, $fields, array $filter) {
        if (!count($fields)) {
            return null;
        }
        foreach ($fields as $key => $fieldName) $fields[$key] = "`$fieldName`";          
        $sql = "SELECT ". implode(',', $fields). " FROM `$table`";
        $where = [];
        foreach ($filter as $fieldName => $fieldValue) {
            $where[] = "`$fieldName` = ". $this->_db->escapeString($fieldValue);
        }
        if (count($where)) {
            $sql .= " WHERE ". implode(' AND ', $where);
        }
        return $sql;
    }
    
    private function generateInviteTrackingId() {
        $command = '/usr/bin/phantomjs  '. __DIR__. '/js/invite_tracking.js';
        $output = [];
        exec($command, $output);
        return $output[0];
    }
    
    private function generateMessageTrackingId() {
        $command = '/usr/bin/phantomjs  '. __DIR__. '/js/message_tracking.js';
        $output = [];
        exec($command, $output);
        return $output[0];
    }
    
    private function generateOriginToken() {
        $command = '/usr/bin/phantomjs  '. __DIR__. '/js/origintoken.js';
        $output = [];
        exec($command, $output);
        return $output[0];
    }
    
    private function serverProtocol() {
        if(isset($_SERVER['HTTPS']) && ($_SERVER['HTTPS'] == 'on' || $_SERVER['HTTPS'] == 1) || isset($_SERVER['HTTP_X_FORWARDED_PROTO']) &&  $_SERVER['HTTP_X_FORWARDED_PROTO'] == 'https')  {
            return 'https://';
        }else {
            return $protocol = 'http://';
        }
    }
    
    private function sendEmail($mailTo, $subject, $html, $path = false) {
        require CLASSES_DIR. '/PHPMailer/src/Exception.php';
        require CLASSES_DIR. '/PHPMailer/src/PHPMailer.php';
        require CLASSES_DIR. '/PHPMailer/src/SMTP.php';
        $mail = new PHPMailer\PHPMailer\PHPMailer(true);
        $mail->CharSet = 'UTF-8';
        $mail->Encoding = 'base64';
        //$mail->SMTPDebug = 4;
        $mail->isSMTP();
        $mail->Host = SMTP_HOST;
        $mail->SMTPAuth = true;
        $mail->Username = MAIL_USER;
        $mail->Password = MAIL_PASSWORD;
        $mail->SMTPSecure = SMTP_SECURE;
        $mail->Port = SMTP_PORT;
        $mail->setFrom(MAIL_USER);
        $mail->addAddress($mailTo);
        $mail->Subject = $subject;
        $mail->Body = $html;
        if ($path && file_exists($path)) {
            $mail->AddAttachment($path);
        }
        $mail->IsHTML(true);
        $mail->SMTPOptions = array('ssl' => array('verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true));
        
        return $mail->send();
    }

    private function totranslit($var, $lower = true, $punkt = true) {
        $langtranslit = array(
            'а' => 'a', 'б' => 'b', 'в' => 'v',
            'г' => 'g', 'д' => 'd', 'е' => 'e',
            'ё' => 'e', 'ж' => 'zh', 'з' => 'z',
            'и' => 'i', 'й' => 'y', 'к' => 'k',
            'л' => 'l', 'м' => 'm', 'н' => 'n',
            'о' => 'o', 'п' => 'p', 'р' => 'r',
            'с' => 's', 'т' => 't', 'у' => 'u',
            'ф' => 'f', 'х' => 'h', 'ц' => 'c',
            'ч' => 'ch', 'ш' => 'sh', 'щ' => 'sch',
            'ь' => '', 'ы' => 'y', 'ъ' => '',
            'э' => 'e', 'ю' => 'yu', 'я' => 'ya',
            "ї" => "yi", "є" => "ye",

            'А' => 'A', 'Б' => 'B', 'В' => 'V',
            'Г' => 'G', 'Д' => 'D', 'Е' => 'E',
            'Ё' => 'E', 'Ж' => 'Zh', 'З' => 'Z',
            'И' => 'I', 'Й' => 'Y', 'К' => 'K',
            'Л' => 'L', 'М' => 'M', 'Н' => 'N',
            'О' => 'O', 'П' => 'P', 'Р' => 'R',
            'С' => 'S', 'Т' => 'T', 'У' => 'U',
            'Ф' => 'F', 'Х' => 'H', 'Ц' => 'C',
            'Ч' => 'Ch', 'Ш' => 'Sh', 'Щ' => 'Sch',
            'Ь' => '', 'Ы' => 'Y', 'Ъ' => '',
            'Э' => 'E', 'Ю' => 'Yu', 'Я' => 'Ya',
            "Ї" => "yi", "Є" => "ye",
        );

        $var = trim( strip_tags( $var ) );
        $var = preg_replace( "/\s+/ms", "-", $var );
        $var = strtr($var, $langtranslit);
        if ( $punkt ) {
            $var = preg_replace( "/[^a-z0-9\_\-.]+/mi", "", $var );
        } else {
            $var = preg_replace( "/[^a-z0-9\_\-]+/mi", "", $var );
        }

        $var = preg_replace( '#[\-]+#i', '-', $var );
        if ($lower) $var = strtolower( $var );
        $var = str_ireplace( ".php", "", $var );
        $var = str_ireplace( ".php", ".ppp", $var );
        if( strlen($var) > 200 ) {
            $var = substr( $var, 0, 200 );
            if(($temp_max = strrpos( $var, '-' ))) $var = substr($var, 0, $temp_max);
        }

        return $var;
    }
}

?>