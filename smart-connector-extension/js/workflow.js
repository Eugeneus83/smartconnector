function Workflow() {
    var apiEndpoint = 'https://app.smartconnector.org/api';
    this.serviceData = null;
    var this_ = this;

    import('./tracking/invite.js').then(function(module){
        this_.generateInviteTrackingId = module.generate;
    });
    import('./tracking/message.js').then(function(module){
        this_.generateMessageTrackingId = module.generate;
    });
    import('./tracking/origintoken.js').then(function(module){
        this_.generateOriginToken = module.generate;
    });

    this.runTasks = async function(){
        var taskList = await getTasks();
        var d = new Date();
        if (!taskList.success) {
            return;
        }
        console.log("Running tasks: invite: " + taskList.invite.length + ', message: ' + taskList.followup.length + ', time: ' + d.getHours() + ':' + d.getMinutes());
        var hdrs = await getHttpHeaders();
        if (taskList.limits.invite) {
            showConnectionsLimit(taskList.limits.invite);
        }else if (taskList.invite) {
            var peopleFlagship = await getPeopleFlaghsip();
            for (var i = 0; i < taskList.invite.length; i ++) {
                var task = taskList.invite[i];
                if (!task.profile_id) {
                    continue;
                }
                task = await updateTaskProfile(task, task.connection_message);
                var invitationResult = null;
                if (task.entity_id) {
                    var invited = false;
                    var isConnected = await isProfileConnected(task.entity_id);
                    if (isConnected) {
                        var sync = {};
                        var publicId = await parsePublicId(task.entity_id);
                        sync[task.entity_id] = {'public_id': publicId, 'accepted_at': null};
                        await syncInvitations(sync);
                        console.log('Already connected');
                        invited = true;
                    }else {
                        var message = task.connection_message?replacePlaceHolders(task.connection_message, task):'';
                        if (message.length > invitationMaxLength) {
                            message = message.substring(0, invitationMaxLength);
                        }
                        invitationResult = await sendInvitation(task.entity_id, message, peopleFlagship);
                        console.log("Invitation success", invitationResult.success);
                        if (invitationResult.success) {
                            console.log("Invitation id", invitationResult.invitation_id);
                        }else {
                            if (invitationResult.status != 429) {
                                await sendInvitationError(task.profile_id, invitationResult.status);
                            }
                        }
                    }
                    if (invited || invitationResult.invitation_id) {
                        await markAsInvited(task.profile_id, invitationResult?invitationResult.invitation_id:0);
                    }
                }
            }
        }
        if (taskList.limits.message) {
            showMessagesLimit(taskList.limits.message);
        }else if (taskList.followup) {
            for (var i = 0; i < taskList.followup.length; i ++) {
                var task = taskList.followup[i];
                if (!task.profile_id) {
                    continue;
                }
                task = await updateTaskProfile(task, task.message);
                if (task.entity_id && task.message) {
                    setProfileInWork(task.profile_id);
                    var message = replacePlaceHolders(task.message, task);
                    console.log('Sending');
                    sendConnectionMessage(task.entity_id, message, task.attachments, function(result){
                        if (result) {
                            console.log('updating follow up');
                            updateFollowupStatus(task.followup_id, task.profile_id, result, function (response) {
                                console.log('send log', response);
                            });
                        }else {
                            console.log('Not sent');
                        }
                    });
                    markAsSent(task.followup_id, task.profile_id);
                }
            }
        }
    }

    this.checkMailbox = async function(callback) {
        var lastChecked = await getMessagesLastChecked();
        var respondedAtByPublicId = {};
        var stopCollecting = false;
        var baseMessagesUrl = linkedinDomain + '/voyager/api/messaging/conversations?keyVersion=LEGACY_INBOX';
        var messagesUrl = baseMessagesUrl + '&count=20&q=syncToken';
        do {
            var conversationByFrom = {};
            var lastMessageDates = [];
            var json = await getData(messagesUrl, await getHttpHeaders());
            var conversationList = {};
            for (var i = 0; i < json.included.length; i ++) {
                var included = json.included[i];
                if (included.$type == 'com.linkedin.voyager.messaging.Event') {
                    var createdAt = parseInt(included.createdAt / 1000);
                    if (lastChecked.timestamp && createdAt < lastChecked.timestamp) {
                        stopCollecting = true;
                    }else {
                        var matches = included['*from'].match(/:\((.+),(.+)\)$/);
                        conversationByFrom[matches[2].trim()] = {'conversation_id': matches[1].trim(), 'created_at': createdAt};
                    }
                    lastMessageDates.push(included.createdAt);
                }else if (included.$type == 'com.linkedin.voyager.messaging.Conversation') {
                    conversationList[included.entityUrn.replace(/^urn:li:fs_conversation:/, '').trim()] = included.backendUrn.replace(/^urn:li:messagingThread:/, '').trim();
                }
            }
            for (var entityId in conversationByFrom) {
                if (entityId.toLowerCase() != 'unknown') {
                    respondedAtByPublicId[entityId] = {'created_at': conversationByFrom[entityId]['created_at']};
                    var threadId = conversationList[conversationByFrom[entityId]['conversation_id']];
                    if (threadId) {
                        respondedAtByPublicId[entityId]['thread_id'] = threadId;
                    }
                }
            }
            var proceed = !stopCollecting && Object.keys(conversationByFrom).length;
            if (proceed) {
                messagesUrl = baseMessagesUrl + '&createdBefore=' + Math.min.apply(Math, lastMessageDates);
                await sleep(1);
            }
        }while (proceed);

        console.log('Mailbox checked');
        if (Object.keys(respondedAtByPublicId).length > 0) {
            await doRequest('message/sync', 'post', respondedAtByPublicId);
        }
        callback();
    }

    this.checkInvitations = async function() {
        var lastChecked = await getInvitationsLastChecked();
        var count = !lastChecked.timestamp || lastChecked.since > 86400?200:40;
        var start = 0;
        var stopCollecting = false;
        do {
            var json = await getData(linkedinDomain + '/voyager/api/relationships/dash/connections?decorationId=com.linkedin.voyager.dash.deco.web.mynetwork.ConnectionListWithProfile-5&count=' + count + '&q=search&sortType=RECENTLY_ADDED&start=' + start, await getHttpHeaders());
            var pubIdByEntity = {};
            for (var i = 0; i < json.included.length; i ++) {
                var included = json.included[i];
                if (included.$type == 'com.linkedin.voyager.dash.identity.profile.Profile') {
                    pubIdByEntity[included.entityUrn] = included.publicIdentifier;
                }
            }
            var data = {};
            for (var i = 0; i < json.data.elements.length; i ++) {
                var element = json.data.elements[i];
                if (pubIdByEntity[element.connectedMember]) {
                    var createdAt = parseInt(element.createdAt / 1000);
                    if (lastChecked.timestamp && createdAt < lastChecked.timestamp) {
                        stopCollecting = true;
                        break;
                    }
                    var entityId = element.connectedMember.replace(/urn:li:fsd_profile:/, '').trim();
                    entityId = entityId.replace(/,$/, entityId);
                    data[entityId] = {'accepted_at': createdAt, 'public_id': pubIdByEntity[element.connectedMember]};
                }
            }
            if (Object.keys(data).length > 0) {
                await syncInvitations(data);
            }
            start += count;
            var proceed = !stopCollecting && Object.keys(data).length;
            if (proceed) {
                await sleep(5);
            }
        }while (proceed);
    }

    var getInvitationsLastChecked = async function() {
        return await doRequest('invitation/latest');
    }

    var getMessagesLastChecked = async function() {
        return await doRequest('message/latest');
    }

    var getTasks = async function() {
        return await doRequest('task/get');
    }

    var doRequest = async function(path, method = 'get', data) {
        var endpoint = apiEndpoint + '/' + path;
        var headers = {};
        if (path != 'user/login' && path != 'user/register' && path != 'user/confirm' && path != 'user/reset_password' && path != 'user/update_password') {
            headers = await getAuthHeaders();
            if (!headers['connector-session-id']) {
                throw new Error('User session not found');
            }
        }
        var $overlay = $('div.overlay');
        if (path != 'task/get' && path != 'invitation/latest' && path != 'message/latest') {
            $overlay.css('display', 'flex');
        }
        var response = null;
        if (method == 'get') {
            response = await getData(endpoint, headers);
        }else if (method == 'post') {
            response = await postData(endpoint, JSON.stringify(data), headers);
        }else if (method == 'put') {
            response = await putData(endpoint, JSON.stringify(data), headers);
        }
        $overlay.css('display', 'none');
        return response;
    }

    var getAuthHeaders = async function() {
        return {'connector-session-id': await getUserSessionId()};
    }

    var getHttpHeaders = async function () {
        var csrfToken = await getCsrfToken();
        if (!csrfToken) {
            alert('Check if you are logged in Linkedin');
            throw new Error('Check if you are logged');
        }
        var serviceData = await getServiceData();
        var clientVersion, clientWidth, clientHeight;
        if (serviceData) {
            clientVersion = serviceData.service_version;
            clientWidth = serviceData.width;
            clientHeight = serviceData.height;
        }else {
            clientVersion = '1.7.7141';
            clientWidth = 1920;
            clientHeight = 1080;
        }
        var headers = { 'Accept': 'application/vnd.linkedin.normalized+json+2.1', 'Accept-Language': 'en-US,en;q=0.5',
            'x-li-track': JSON.stringify({"clientVersion": clientVersion, "osName": "web", "timezoneOffset": 3, "deviceFormFactor": "DESKTOP", "mpName": "voyager-web", "displayDensity":1, "displayWidth": clientWidth, "displayHeight": clientHeight}),
            'x-li-lang': 'en_US', 'csrf-token': csrfToken, 'x-restli-protocol-version': '2.0.0',
        }
        return headers;
    }

    this.buildSearchFilter = function(query) {
        if (query.indexOf('?') === -1) {
            return null;
        }
        query = query.replace(/^.+\?/, '', query);
        var filter = {'filter': ['resultType-%3EPEOPLE']};
        query = query.split('&');

        for (var key in query) {
            var pair = query[key].split('=');
            var rawParamValue = decodeURIComponent(pair[1]).trim();
            var paramName = pair[0].replace(/^facet/, '').trim();
            if (paramName == 'keywords') {
                if (!filter['keywords']) filter['keywords'] = [];
                filter['keywords'] = rawParamValue;
            }else if (paramName == 'origin') {
                filter['origin'] = rawParamValue;
            }else {
                var paramValues = rawParamValue.replace(/[\[\]\"]+/g, '').trim().split(',');
                paramName = paramName[0].toLowerCase() + paramName.substring(1).replace(/Filter$/, '').trim();
                filter['filter'].push(paramName + encodeURIComponent('->') + paramValues.join(encodeURIComponent('|')));
            }
        }
        return filter;
    }

    this.collectPeople = async function(filter, fetchProfileCallback, fetchPageCallback, endCollectCallback) {
        var pagesCount = 0;
        var totalOnPage = 50;
        var pageNum = 0;
        var start = 0;
        var connections;
        var elements = {};
        var contactTitles;
        var addedProfiles = {};

        do{
            pageNum ++;
            var url = linkedinDomain + '/voyager/api/search/blended?count=' + totalOnPage + '&filters=List(' + filter['filter'].join(',') + ')';
            if (filter['keywords']) {
                url += '&keywords=' + filter['keywords'];
            }
            url += '&origin=' + (filter['origin']?filter['origin']:'FACETED_SEARCH') + '&q=all&queryContext=List(spellCorrectionEnabled-%3Etrue';
            if (filter['keywords']) {
                url += ',relatedSearchesEnabled-%3Etrue';
            }
            url += ')&start=' + start;
            var headers = await getHttpHeaders();
            var connections = await getData(url, headers);
            var error = null;
            if (connections.status) {
                if (connections.status == '401') {
                    error = 'Check if you are logged';
                }
            }
            if (!error && !connections.included) {
                error = 'Something is wrong';
            }
            if (error) {
                alert('Error: ' + error);
                return;
            }
            contactTitles = {};
            elements = [];
            for (var key in connections.data.elements) {
                if (connections.data.elements[key].type.toUpperCase() == 'SEARCH_HITS') {
                    elements = connections.data.elements[key].elements;
                    break;
                }
            }
            if (pagesCount == 0) {
                var totalResultFound = connections.data.metadata.totalResultCount;
                if (totalResultFound > 1000) {
                    alert('Total results number more than 1000. Will be collected only first 1000 results.');
                    totalResultFound = 1000;
                }
                pagesCount = Math.ceil(totalResultFound / totalOnPage);
            }
            for (var key in elements) {
                if (elements[key].publicIdentifier) {
                    if (elements[key].headline) {
                        contactTitles[elements[key].publicIdentifier] = elements[key].headline.text;
                    }
                }
            }
            var contactList = {};
            var contact;
            for (var key in connections.included) {
                contact = connections.included[key];
                if (contact.publicIdentifier && contact.entityUrn && contact.firstName) {
                    var jobTitle = contactTitles[contact.publicIdentifier]?contactTitles[contact.publicIdentifier]:'';
                    var company = jobTitle.replace(/^.+\s+at\s+/gi, '').trim();
                    if (company == jobTitle) {
                        company = '';
                    }
                    var matches = contact.entityUrn.match(/urn:li:fs_miniProfile:(.+)$/);
                    contactList[contact.publicIdentifier] = {'public_id': contact.publicIdentifier, 'entity_id': matches?matches[1].trim():null, 'first_name': contact.firstName, 'last_name': contact.lastName, 'company': company, 'job_title': jobTitle, 'profile_url': linkedinDomain + '/in/' + contact.publicIdentifier};
                    if (contact['picture'] && contact.picture.artifacts && contact.picture.artifacts.length > 0) {
                        contactList[contact.publicIdentifier]['picture'] = contact.picture.artifacts[0].fileIdentifyingUrlPathSegment?contact.picture.rootUrl + contact.picture.artifacts[0].fileIdentifyingUrlPathSegment:'';
                    }
                }
            }
            for (var publicId in contactTitles) {
                var profile = contactList[publicId];
                if (!addedProfiles[publicId]) {
                    fetchProfileCallback(profile);
                    addedProfiles[publicId] = 1;
                }
            }
            start += totalOnPage;
            fetchPageCallback();

        }while (pageNum < pagesCount);

        endCollectCallback();
    }

    this.collectPeopleFromNavigator = async function(apiUrl, fetchProfileCallback, fetchPageCallback, endCollectCallback) {
        if (!apiUrl) {
            return;
        }
        var pagesCount = 0;
        var totalOnPage = 50;
        var pageNum = 0;
        var start = 0;
        var connections;
        var elements = {};
        var contactTitles;
        var addedProfiles = {};
        var i;
        do {
            pageNum ++;
            var url = apiUrl + '&count=' + totalOnPage + '&start=' + start;
            var headers = await getHttpHeaders();
            headers['x-li-identity'] = await getPrimaryIdentity();
            var connections = await getData(url, headers);

            if (pagesCount == 0) {
                var totalResultFound = connections.data.paging.total;
                if (totalResultFound > 1000) {
                    alert('Total results number more than 1000. Will be collected only first 1000 results.');
                    totalResultFound = 1000;
                }
                pagesCount = Math.ceil(totalResultFound / totalOnPage);
            }

            var elements = [];
            for (i = 0; i < connections.data['*elements'].length; i ++) {
                elements.push(connections.data['*elements'][i]);
            }

            var contactList = {};
            var contact;
            for (var key in connections.included) {
                contact = connections.included[key];
                if (contact['$type'] == 'com.linkedin.sales.search.DecoratedPeopleSearchHit') {
                    var company = contact.currentPositions.length?contact.currentPositions[0].companyName:null;
                    var jobTitle = contact.currentPositions.length?contact.currentPositions[0].title:null;
                    var matches = contact.entityUrn.match(/urn:li:fs_salesProfile:\(([^,]+),/);

                    if (matches) {
                        var entityId = matches[1].trim();
                        contactList[contact.entityUrn] = {
                            'entity_id': entityId,
                            'first_name': contact.firstName,
                            'last_name': contact.lastName,
                            'company': company,
                            'job_title': jobTitle
                        };
                        if (contact.profilePictureDisplayImage && contact.profilePictureDisplayImage.artifacts && contact.profilePictureDisplayImage.artifacts.length > 0) {
                            contactList[contact.entityUrn]['picture'] = contact.profilePictureDisplayImage.artifacts[0].fileIdentifyingUrlPathSegment?contact.profilePictureDisplayImage.rootUrl + contact.profilePictureDisplayImage.artifacts[0].fileIdentifyingUrlPathSegment : '';
                        }
                    }
                }
            }
            for (i = 0; i < elements.length; i ++) {
                if (contactList[elements[i]]) {
                    var profile = contactList[elements[i]];
                    if (!addedProfiles[elements[i]]) {
                        fetchProfileCallback(profile);
                        addedProfiles[elements[i]] = 1;
                    }
                }
            }
            start += totalOnPage;
            fetchPageCallback();
        }while (pageNum < pagesCount);

        endCollectCallback();
    }

    this.buildSearchFilter_new = function(query) {
        if (query.indexOf('?') === -1) {
            return null;
        }
        query = query.replace(/^.+\?/, '', query);
        var filter = {'filter': ['resultType:List(PEOPLE)']};
        query = query.split('&');

        for (var key in query) {
            var pair = query[key].split('=');
            var rawParamValue = decodeURIComponent(pair[1]).trim();
            var paramName = pair[0].replace(/^facet/, '').trim();
            if (paramName == 'keywords') {
                if (!filter['keywords']) filter['keywords'] = [];
                filter['keywords'] = rawParamValue;
            }else if (paramName == 'origin') {
                filter['origin'] = rawParamValue;
            }else {
                var paramValues = rawParamValue.replace(/[\[\]\"]+/g, '').trim().split(',');
                paramName = paramName[0].toLowerCase() + paramName.substring(1);
                filter['filter'].push(paramName + ':List(' + paramValues.join(',') + ')');
            }
        }
        return filter;
    }

    this.collectPeople_new = async function(filter, fetchProfileCallback, fetchPageCallback, endCollectCallback) {
        var pagesCount = 0;
        var totalOnPage = 50;
        var pageNum = 1;
        var start = 0;
        var connections;
        var elements = {};
        var entityIds;
        var addedProfiles = {};
        var contactList = [];

        do{
            pageNum ++;
            var url = linkedinDomain + '/voyager/api/search/dash/clusters?decorationId=com.linkedin.voyager.dash.deco.search.SearchClusterCollection-83';
            url += '&origin=' + (filter['origin']?filter['origin']:'FACETED_SEARCH') + '&q=all';
            url += '&query=(flagshipSearchIntent:SEARCH_SRP,queryParameters:(' + filter['filter'].join(',') + '))';
            url += '&start=' + start + '&count=' + totalOnPage;
            var headers = await getHttpHeaders();
            var connections = await getData(url, headers);
            var error = null;
            if (connections.status) {
                if (connections.status == '401') {
                    error = 'Check if you are logged';
                }
            }
            if (!error && !connections.included) {
                error = 'Something is wrong';
            }
            if (error) {
                alert('Error: ' + error);
                return;
            }
            entityIds = {};
            for (var key in connections.data.elements) {
                if (connections.data.elements[key]['*results']) {
                    var elements = connections.data.elements[key]['*results'];
                    for (var i = 0; i < elements.length; i ++) {
                        var matches = elements[i].match(/urn:li:fsd_profile:(.+),/);
                        entityIds[matches[1].trim()] = 1;
                    }
                    break;
                }
            }
            if (pagesCount == 0) {
                pagesCount = Math.ceil(connections.data.metadata.totalResultCount / totalOnPage);
            }

            contactList = {};
            var contact;
            for (var key in connections.included) {
                if (connections.included[key]['$type'] == 'com.linkedin.voyager.dash.search.EntityResultViewModel') {
                    contact = connections.included[key];
                    var publicId = contact.navigationUrl.replace(/^.+\/in\//, '').trim();
                    if (publicId && contact.entityUrn) {
                        var title = contact['title']['text'].trim().split(' ');
                        var firstName = title[0].trim();
                        var lastName = title[1].trim();
                        var jobTitle = contact['primarySubtitle']['text'];
                        var company = jobTitle.replace(/^.+\s+at\s+/gi, '').trim();
                        if (company == jobTitle) {
                            company = '';
                        }
                        var matches = contact.entityUrn.match(/urn:li:fsd_profile:(.+),/);
                        var entityId = matches[1].trim();
                        contactList[entityId] = {
                            'public_id': publicId,
                            'entity_id': entityId,
                            'first_name': firstName,
                            'last_name': lastName,
                            'company': company,
                            'profile_url': contact.navigationUrl
                        };
                        if (contact.image && contact.image.attributes && contact.image.attributes.length > 0) {
                            if (contact.image.attributes[0].detailDataUnion.nonEntityProfilePicture) {
                                var vectorImage = contact.image.attributes[0].detailDataUnion.nonEntityProfilePicture.vectorImage;
                                if (vectorImage && vectorImage.artifacts && vectorImage.artifacts.length > 0) {
                                    contactList[entityId]['picture'] = vectorImage.artifacts[0].fileIdentifyingUrlPathSegment ? vectorImage.rootUrl + vectorImage.artifacts[0].fileIdentifyingUrlPathSegment : '';
                                }
                            }
                        }
                    }
                }
            }
            for (var entityId in entityIds) {
                var profile = contactList[entityId];
                if (!addedProfiles[entityId]) {
                    fetchProfileCallback(profile);
                    addedProfiles[entityId] = 1;
                }
            }
            start += totalOnPage;
            fetchPageCallback();

        }while (pageNum <= pagesCount);

        endCollectCallback();
    }

    this.createAttachment = async function(file) {
        var formData = new FormData();
        formData.append('attachment', file);
        return await postData(apiEndpoint + '/attachment/add', formData, await getAuthHeaders());
    }

    this.deleteAttachment = function(url) {
        doRequest('attachment/delete', 'put', {url: url});
    }

    this.addCampaign = async function(campaign, callback) {
        return await doRequest('campaign/add', 'post', campaign);
    }

    this.editCampaign = async function(campaignId, campaign, callback) {
        var result = await doRequest('campaign/edit/' + campaignId, 'post', campaign);
        if (callback) {
            callback(result);
        }
    }

    this.getCampaignList = async function() {
        return await doRequest('campaign/list');
    }

    this.getCampaign = async function(campaignId) {
        return await doRequest('campaign/get/' + campaignId);
    }

    this.getCampaignStat = async function(campaigId) {
        return await doRequest('campaign/stat/' + campaigId);
    }

    this.editProfile = async function(profileId, profile) {
        return await doRequest('profile/edit/' + profileId, 'put', profile);
    }

    this.deleteCampaignProfile = async function(campaignId, profileId) {
        return await doRequest('profile/delete/' + campaignId + '/' + profileId);
    }

    this.login = async function(email, password, callback) {
        var response = await doRequest('user/login' , 'post', {email: email, password: password});
        callback(response);
    }

    this.register = async function(email, username, password, callback) {
        var response = await doRequest('user/register' , 'post', {email: email, username: username, password: password});
        callback(response);
    }

    this.resetPassword = async function(email, callback) {
        var response = await doRequest('user/reset_password' , 'post', {email: email});
        callback(response);
    }

    this.updatePassword = async function(code, email, password, callback) {
        var response = await doRequest('user/update_password' , 'post', {code: code, email: email, password: password});
        callback(response);
    }

    this.confirm = async function(code, callback) {
        var response = await doRequest('user/confirm' , 'post', {code: code});
        callback(response);
    }

    this.getUser = async function() {
        return await doRequest('user/get');
    }

    var syncInvitations = async function(data) {
        await doRequest('invitation/sync', 'post', data);
        var entityIds = Object.keys(data);
        for (var i = 0; i < entityIds.length; i ++) {
            setProfileAccepted(entityIds[i]);
        }
    }

    var setProfileInWork = async function(profileId) {
        await doRequest('profile/in_work/' + profileId);
    }

    var updateTaskProfile = async function(task, msgText) {
        var oldTask = Object.assign({}, task);;
        if (!task.entity_id) {
            var profileData = await parseProfileData(task.public_id);
            if (profileData) {
                task.entity_id = profileData.entity_id;
                if (!task.first_name) {
                    task.first_name = profileData.first_name;
                }
                if (!task.last_name) {
                    task.last_name = profileData.last_name;
                }
            }
        }
        if (!task.company && checkMessagePlaceholder(msgText, 'company')) {
            var companyList = await parseProfileCompanyList(task.public_id);
            if (companyList.length) {
                task.company = companyList[0];
            }
        }

        if (JSON.stringify(task) != JSON.stringify(oldTask)) {
            var profile = {
                'public_id': task.public_id,
                'entity_id': task.entity_id,
                'first_name': task.first_name,
                'last_name': task.last_name,
                'company': task.company
            };
            this_.editProfile(task.profile_id, profile);
            if ($campaignDetail.is(":visible")) {
                loadCampaignPeople([profile], false, false);
            }
        }
        return task;
    }

    var parseProfileData = async function(publicId) {
        var url = linkedinDomain + '/voyager/api/identity/profiles/' + publicId + '/';
        var headers = await getHttpHeaders();
        var pageInstanceId = getServiceData('page_instance_id');
        if (pageInstanceId) {
            headers['x-li-page-instance'] = 'urn:li:page:d_flagship3_profile_view_base;' + pageInstanceId;
        }
        var response = await getData(url, headers);
        if (response && response.data) {
            return {
                'entity_id': response.data['*miniProfile'].replace(/^urn:li:fs_miniProfile:/, '').trim(),
                'first_name': response.data.firstName,
                'last_name': response.data.lastName
            };
        }
    }

    var parseProfileCompanyList = async function(publicId) {
        var companyList = {};
        var url = linkedinDomain + '/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=' + publicId + '&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-57';
        var headers = await getHttpHeaders();
        var pageInstanceId = getServiceData('page_instance_id');
        if (pageInstanceId) {
            headers['x-li-page-instance'] = 'urn:li:page:d_flagship3_profile_view_base;' + pageInstanceId;
        }
        var json = await getData(url, headers);
        if (!json) {
            return;
        }
        for (var i = 0; i < json.included.length; i ++) {
            var included = json.included[i];
            if (included.$type == 'com.linkedin.voyager.dash.identity.profile.Position') {
                var workAt;
                if (included.dateRange && included.dateRange['end']) {
                    workAt = new Date(included.dateRange['end'].year, included.dateRange['end'].month?included.dateRange['end'].month:1 - 1, 1, 0, 0, 0, 0);
                }else {
                    workAt = new Date();
                }
                companyList[included.companyName] = workAt.getTime();
            }
        }
        companyList = sort(companyList);
        return Object.keys(companyList);
    }

    var parsePublicId = async function(entityId) {
        var headers = await getHttpHeaders();
        var url = linkedinDomain + '/voyager/api/identity/profiles/' + entityId + '/profileView';
        var json = await getData(url, headers);
        for (var i = 0; i < json.included.length; i ++) {
             if (json.included[i].publicIdentifier) {
                 return json.included[i].publicIdentifier;
             }
        }
        return null;
    }

    var getPeopleFlaghsip = async function(){
        var resp = await getData(linkedinDomain + '/mynetwork/', [], 'text');
        var matches = resp.match(/d_flagship3_people;(.+)/);
        return matches?decodeHtml(matches[1].trim()):null;
    }

    var isProfileConnected = async function(entityId) {
        var url = linkedinDomain + '/voyager/api/identity/profiles/' + entityId + '/profileActions';
        var headers = await getHttpHeaders();
        var pageInstanceId = getServiceData('page_instance_id');
        if (pageInstanceId) {
            headers['x-li-page-instance'] = 'urn:li:page:d_flagship3_profile_view_base;' + pageInstanceId;
        }
        var response = await getData(url, headers);
        if (response && response.data && response.data.overflowActions) {
            for (var i = 0; i < response.data.overflowActions.length; i ++) {
                var action = response.data.overflowActions[i];
                if (action['action']['$type'] == 'com.linkedin.voyager.identity.profile.actions.Disconnect') {
                    return true;
                }
            }
        }
        return false;
    }

    var sendInvitation = async function (entityId, invitationText, flagShip) {
        var result = {'success': false};
        var url = linkedinDomain + '/voyager/api/growth/normInvitations';
        var post = {"emberEntityName": "growth/invitation/norm-invitation", "invitee":{"com.linkedin.voyager.growth.invitation.InviteeProfile": {"profileId": entityId}}, "trackingId": this_.generateInviteTrackingId()};
        if (invitationText) {
            post['message'] = invitationText.trim();
        }
        var headers = await getHttpHeaders();
        if (flagShip) {
            headers['x-li-page-instance'] = 'urn:li:page:d_flagship3_people;' + flagShip;
        }
        var response = await postData(url, JSON.stringify(post), headers, true);
        if (response.status == 201) {
            var location = response.getResponseHeader('location');
            if (!location) {
                throw new Exception("Couldn't find the relation id");
            }
            result['success'] = true;
            result['invitation_id'] = basename(location);
        }else {
            result['status'] = response.status;
        }
        return result;
    }

    this.withdrawInvitation = async function(profileId, invitationId, callback) {
        var url = linkedinDomain + '/voyager/api/relationships/invitations?action=closeInvitations';
        var post = {"inviteActionType": "ACTOR_WITHDRAW","inviteActionData": [{"entityUrn": "urn:li:fs_relInvitation:" + invitationId, "genericInvitation":false, "genericInvitationType": "CONNECTION"}]};
        var response = await postData(url, JSON.stringify(post), await getHttpHeaders());
        var responseCode = Object.values(response.data.value.statusCodeMap)[0];
        var success = responseCode == 200;
        var result = null;
        if (success) {
            result = await doRequest('invitation/withdraw/' + profileId);
        }
        callback(success, result && result.errors?result.errors:[]);
    }

    this.updateLimit = async function(data = {}, callback) {
        var result = null;
        if (data.invite || data.message) {
            result = await doRequest('limit/update', 'post', data);
        }
        if (callback) {
            callback(result);
        }
    }

    this.getProfileEntity = async function(publicId) {
        var url = linkedinDomain + '/voyager/api/identity/profiles/' + publicId;
        var response = await getData(url, await getHttpHeaders());
        if (response.data && response.data.entityUrn) {
            return response.data.entityUrn.replace('urn:li:fs_profile:', '').trim();
        }
        return null;
    }

    var sendConnectionMessage = async function (entityId, text, files, callback) {
        var post;
        var attachments = [];
        var headers = await getHttpHeaders();
        var pageInstanceId = getServiceData('page_instance_id');
        if (pageInstanceId) {
            headers['x-li-page-instance'] = 'urn:li:page:d_flagship3_messaging;' + pageInstanceId;
        }
        if (!files) files = [];
        for (var i = 0; i < files.length; i ++) {
            var fileUrl = files[i];
            var fileName = basename(fileUrl);
            var uploadedFile = await doUploadFile(fileUrl + '?t=' + Date.now());
            if (uploadedFile && uploadedFile.url) {
                var fileData = await getData(uploadedFile.url, {}, 'blob');
                if (fileData) {
                    var uploadUrl = linkedinDomain + '/voyager/api/voyagerMediaUploadMetadata?action=upload';
                    post = {mediaUploadType: "MESSAGING_FILE_ATTACHMENT", fileSize: fileData.size, filename: fileName};
                    var response = await postData(uploadUrl, JSON.stringify(post), headers);
                    await putData(response.data.value.singleUploadUrl, fileData, {
                        'content-type': fileData.type,
                        'csrf-token': headers['csrf-token']
                    });
                    attachments.push({
                        "id": response.data.value.urn,
                        "name": fileName,
                        "byteSize": fileData.size,
                        "mediaType": fileData.type,
                        "reference": {"string": uploadedFile.url}
                    });
                }
            }
        }
        post = {"keyVersion": "LEGACY_INBOX", "conversationCreate": {"eventCreate": {"originToken": this_.generateOriginToken(), "value": {"com.linkedin.voyager.messaging.create.MessageCreate": {"attributedBody":{"text":text, "attributes": []}, "attachments": attachments}}, "trackingId": this_.generateMessageTrackingId()},"recipients":[entityId],"subtype":"MEMBER_TO_MEMBER"}};
        var response = await postData(linkedinDomain + '/voyager/api/messaging/conversations?action=create', JSON.stringify(post), headers);
        var report = {'success': false};
        if (response.data) {
            report.success = true;
            report.created_at = response.data.value.createdAt;
            if (response.data.value && response.data.value.conversationUrn) {
                report.thread_id = response.data.value.conversationUrn.replace(/^urn:li:fs_conversation:/, '').trim();
            }
        }else if (response.status){
            report.error = response.status;
        }
        callback(report);
    }

    var updateFollowupStatus = async function(followupId, profileId, status, callback) {
        var response = await doRequest('message/sent/' + followupId + '/' + profileId, 'post', status);
        callback(response);
    }

    var sendInvitationError = function(profileId, status) {
        doRequest('invitation/error/' + profileId + '/' + status);
    }

    var markAsInvited = async function(profileId, invitationId) {
        doRequest('invitation/sent/' + profileId + '/' + invitationId);
        setProfileInvited(profileId);
    }

    var markAsSent = function(followupId, profileId) {
        doRequest('message/sent/' + followupId + '/' + profileId);
    }

    var replacePlaceHolders = function(text, data) {
        var placeholders = ['first_name', 'last_name', 'full_name', 'company', 'custom_snippet_1', 'custom_snippet_2', 'custom_snippet_3'];
        for (var i = 0; i < placeholders.length; i ++) {
            var regexp = new RegExp('\{\{' + placeholders[i] + '\}\}', 'g');
            text = text.replace(regexp, data[placeholders[i]]?data[placeholders[i]]:'');
        }
        return text;
    }

    function decodeHtml(html) {
        var txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    }

    var getCsrfToken = async function() {
        var csrfToken = await getCookie('JSESSIONID');
        return csrfToken.replace(/"/g, '').trim();
    }

    function getServiceData(fieldName = null){
        if (this_.serviceData) {
            return fieldName?this_.serviceData[fieldName]:this_.serviceData;
        }else {
            return new Promise(function (resolve, reject) {
                chrome.tabs.getCurrent(function(tab){
                    chrome.runtime.sendMessage({
                        action: 'getServiceData',
                        tabId: tab.id
                    }, function (response) {
                        this_.serviceData = response;
                        resolve(fieldName?this_.serviceData[fieldName]:this_.serviceData);
                    });
                });
            });
        }
    }

    function getPrimaryIdentity(){
        return new Promise(function (resolve, reject) {
            chrome.runtime.sendMessage({
                action: 'getPrimaryIdentity'
            }, function (response) {
                resolve(response);
            });
        });
    }

    var sleep = async function(sec) {
        await new Promise(r => setTimeout(r, sec * 1000));
    }

    var checkMessagePlaceholder = function(msg, field) {
        return msg.indexOf('{{' + field + '}}') > -1;
    }

    var sort = function(object) {
        var sortedObject = {};
        var values = Object.values(object);
        var keys = Object.keys(object);
        values.sort().reverse();
        var i, j;
        for (i = 0; i < values.length; i ++) {
            for (j = 0; j < keys.length; j ++) {
                if (object[keys[j]] == values[i]) {
                    sortedObject[keys[j]] = values[i];
                }
            }
         }
        return sortedObject;
    }

    function basename(path) {
        return path.split('/').reverse()[0];
    }
}