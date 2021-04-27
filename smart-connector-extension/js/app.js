var workflow, $campaignList, $progressBar, $createCampaignLink, $messagesStep, $searchPeopleStep, $h2Title, $goNext, $goBack, $navBack, $peopleStep, $campaignNameStep, $campaignName, $saveCampaignLink, $saveCampaignMessages, $editCampaignMessages, $changeCampaignStatus, $addCampaignPeople, $cancelCampaignMessages, $addPeopleToCampaign, $campaignDetail, $xDaysAfter, $addPeopleFromLinkedinSearch, $addPeopleFromSalesNavigator, $showLinkedinSearch, $applyLinkedinSearch, $collectPeopleLink, attachmentList = {};

$(async function(){
    workflow = new Workflow();
    $campaignList = $('div#campaign-list');
    $campaignNameStep = $('div#campaign-name-step');
    $campaignName = $('input#campaign-name');
    $messagesStep = $('#messages-step');
    $searchPeopleStep = $('#search-people-step');
    $peopleStep = $('#people-step');
    $progressBar = $('ul.bx--progress');
    $createCampaignLink = $('a#create-campaign');
    $saveCampaignLink = $('a#save-campaign');
    $saveCampaignMessages = $('button#save-campaign-messages');
    $cancelCampaignMessages = $('button#cancel-campaign-messages');
    $addPeopleToCampaign = $('button#add-people-to-campaign');
    $addCampaignPeople = $('button#add-campaign-people');
    $campaignDetail = $('div#campaign-detail');
    $addPeopleFromLinkedinSearch = $('a#add-people-from-linkedin-search');
    $addPeopleFromSalesNavigator = $('a#add-people-from-sales-navigator');
    $showLinkedinSearch = $('a#show-linkedin-search');
    $applyLinkedinSearch = $('#apply-linkedin-search');
    $collectPeopleLink = $('a#collect-people');
    $changeCampaignStatus = $('button#change-campaign-status');
    $editCampaignMessages = $('button#edit-campaign-messages');
    $goBack = $('a#go-back');
    $goNext = $('a#go-next');
    $h2Title = $('h2.title');
    $navBack = $('a#navBack');
    $xDaysAfter = $('div.main-send__after');
    $campaignDetail.hide();
    $progressBar.hide();
    $campaignNameStep.hide();
    $messagesStep.hide();
    $saveCampaignMessages.hide();
    $cancelCampaignMessages.hide();
    $addPeopleToCampaign.hide();
    //$addCampaignPeople.hide();
    $searchPeopleStep.hide();
    $peopleStep.hide();
    $saveCampaignLink.hide();
    $goBack.hide();
    $goNext.hide();
    $navBack.hide();
    $xDaysAfter.hide();
    $applyLinkedinSearch.hide();

    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.current_search_status) {
            if (request.current_search_status == 'show') {
                $applyLinkedinSearch.show();
                $showLinkedinSearch.hide();
            }else {
                $showLinkedinSearch.show();
                $applyLinkedinSearch.hide();
            }
        }
    });

    $createCampaignLink.click(gotoCampaignName);

    $('div#messages-step').bind('dropdown-selected', function(evt) {
        if (evt.target.dataset.value != 0) {
            var textareaEl = $(evt.target).parent().find('textarea');
            if (textareaEl.length) {
                setTimeout(function(){
                    typeInTextarea('{{' + evt.target.dataset.value + '}}', textareaEl.get(0));
                    $(evt.target).find('li.bx--dropdown--selected').removeClass('bx--dropdown--selected');
                    $('#personalize-message-value').text('Personalize');
                }, 50);
            }
        }
    });

    $('#add-follow-up').click(function(event){
        addFollowUpMessage();
    });

    $collectPeopleLink.click(async function(){
        var searchUrl = await getCurrentUrl();
        gotoCollectPeople(searchUrl);
    });

    $('a.bx--tabs__nav-link[tab-id]').click(function(){
        var tabId = $(this).attr('tab-id');
        if (tabId == 'activity') {
            $changeCampaignStatus.show();
            $editCampaignMessages.hide();
            $addCampaignPeople.hide();
        }else if (tabId == 'messages') {
            $editCampaignMessages.show();
            $changeCampaignStatus.hide();
            $addCampaignPeople.hide();
        }else if (tabId == 'people') {
            $addCampaignPeople.show();
            $editCampaignMessages.hide();
            $changeCampaignStatus.hide();
        }
    });

    $saveCampaignLink.click(async function(){
        var campaign = getCampaignData(5);
        var errors = [];
        if (!campaign['name']) {
            errors.push('Campaign name is empty');
        }
        if (!campaign['messages']) {
            errors.push('Campaign messages list is empty');
        }
        if (!campaign['people'] || campaign['people'].length == 0) {
            errors.push('Campaign people list is empty');
        }
        if (errors.length) {
            showErrors(errors);
            return false;
        }
        var peopleCount = readCampaignPeopleNumber(campaign['people'].length);
        var peopleStartingFrom = readCampaignPeopleStartingFrom(1);
        campaign['people'] = campaign['people'].slice(peopleStartingFrom, peopleStartingFrom + peopleCount);
        if (campaign['people'].length == 0) {
            alert('People number must be greater than 0');
            return;
        }

        var result = await workflow.addCampaign(campaign);
        var errors = [];
        if (result.errors) {
            if (result.entity_ids) {
                var existingPublicIds = {};
                for (var i = 0; i < result.entity_ids.length; i ++) {
                    existingPublicIds[result.entity_ids[i]] = 1;
                }
                if (confirm(result.errors[0])) {
                    campaign['allow_duplicate'] = 1;
                    var result = await workflow.addCampaign(campaign);
                    if (result.errors) {
                        showErrors(result.errors);
                        return;
                    }
                }else {
                    $('.user-body__list .user-body__item').each(function(){
                        var $this = $(this);
                        if (existingPublicIds[$this.attr('entity_id')]) {
                            $this.css('background-color', 'red');
                        }else {
                            $this.css('background-color', 'none');
                        }
                    });
                    return;
                }
            }else {
                showErrors(result.errors);
                return;
            }
        }

        alert('Campaign is created! To activate campaign please follow to "Activity" tab and press "Start campaign" button.');

        buildCampaignList();
        gotoCampaignList();
    });

    $addPeopleToCampaign.click(async function(){
        var people = collectCampaignPeople();
        if (people.length > 0) {
            var peopleCount = readCampaignPeopleNumber(people.length);
            if (peopleCount === 0) {
                alert('People number must be greater than 0');
                return;
            }
            var peopleStartingFrom = readCampaignPeopleStartingFrom(1);
            people = people.slice(peopleStartingFrom, peopleStartingFrom + peopleCount);
            if (people.length > 0) {
                var campaignId = $(this).attr('campaign_id');
                workflow.editCampaign(campaignId, {'people': people}, function () {
                    editPeopleCallback(campaignId, people);
                });
            }
        }
    });

    $addPeopleFromLinkedinSearch.click(function(){
        chrome.tabs.update({url: linkedinSearchUrl, selected: true, active: true});
    });

    $addPeopleFromSalesNavigator.click(async function(){
        deleteFromStore('navigate_search_api_url', function(){
            chrome.tabs.update({url: navigatorSearchUrl + '?viewAllFilters=true', selected: true, active: true});
        });
    });

    $showLinkedinSearch.click(async function(){
        showPeopleSearch(onPeopleSearch);
    });

    chrome.webRequest.onCompleted.addListener((details) =>
    {
        if (details.url.indexOf('sales-api/salesApiPeopleSearch') > -1) {
            saveInStore('navigate_search_api_url', details.url.replace(/&start=[0-9]+/, '').replace(/&count=[0-9]+/, '').trim());
        }
    },{
        urls: [
            "https://www.linkedin.com/*"
        ],
        types: ["xmlhttprequest"]
    },[]);

    $applyLinkedinSearch.click(function(){
        applyPeopleSearch();
        $applyLinkedinSearch.hide();
        $showLinkedinSearch.show();
    });

    $navBack.click(gotoCampaignList);

    $('div#messages-step input.keep-sending-messages').change(function(){
        var isChecked = this.checked;
        $('div.followup-message p.send-schedule-title').each(function(){
            var $sendImmediatelyInputs = $('input.send-immediately-when-replied');
            if (isChecked) {
                this.innerText = this.innerText.replace('if no reply', 'even if replied');
                $sendImmediatelyInputs.removeAttr('disabled');
            }else {
                this.innerText = this.innerText.replace('even if replied', 'if no reply');
                $sendImmediatelyInputs.prop('checked', false).attr('disabled', 'disabled');
            }
        })
    });

    $('a.upload-people-csv').click(function(e){
        e.preventDefault();
        var $csvCollectedCount = $('#csv_collected_count');
        $csvCollectedCount.hide();
        var $input = $(document.createElement("input"));
        $input.attr("type", "file").attr('accept', '.csv');
        $input.change(async function(){
            var fl = this.files[0];
            var reader = new FileReader();
            reader.onload = async function (e) {
                var lines = e.target.result.split("\n");
                if (!lines.length) {
                    alert('File is empty');
                    return;
                }
                var csvHeaders = {};
                var delimiter = getCsvDelimiter(lines[0]);
                if (!delimiter) {
                    alert('Unknown columns delimiter. Please use ";" or "," or "tab" as csv column delimiter');
                    return;
                }
                parseCsvRow(lines[0], delimiter).forEach(function(field, index){
                    csvHeaders[field.trim()] = index;
                });
                var $mapCsvWidget = $('div#search-people-step div#modal-map-people-csv');
                $mapCsvWidget.find('ul.bx--dropdown-list').each(function(a, b){
                    var $this = $(this);
                    $this.html('');
                    var mapOptionValues = [''].concat(Object.keys(csvHeaders));
                    for (var i = 0; i < mapOptionValues.length; i ++) {
                        $(this).append('<li data-option data-value="all" class="bx--dropdown-item">\n' +
                            '<span class="bx--dropdown-link" tabindex="-1" role="menuitemradio" aria-checked="true">' + mapOptionValues[i] + '</span>\n' +
                            '</li>');
                    }
                });
                var $link = $(document.createElement("a")).attr("data-modal-target", "#modal-map-people-csv");
                $('body').append($link);
                $link.get(0).click();
                $link.remove();
                $mapCsvWidget.find('button.import').unbind('click').click(async function(){
                    $csvCollectedCount.show();
                    var $overlay = $('div.overlay2');
                    $overlay.css('display', 'flex');
                    var columnNumbersByFieldName = {'public_id': null, 'first_name': null, 'last_name': null, 'company': null, 'custom_snippet_1': null, 'custom_snippet_2': null, 'custom_snippet_3': null};
                    for (var fieldName in columnNumbersByFieldName) {
                        var columnValue = $mapCsvWidget.find('#' + fieldName + '-column-value').text();
                        if (csvHeaders[columnValue] !== undefined) {
                            columnNumbersByFieldName[fieldName] = csvHeaders[columnValue];
                        }
                    }
                    if (columnNumbersByFieldName['public_id'] === null) {
                        alert("Profile Url column is required");
                        return;
                    }
                    var peopleList = [];
                    for (var i = 1; i < lines.length; i ++) {
                        if (!lines[i]) continue;
                        var row = parseCsvRow(lines[i], delimiter).map(function(x) {
                            return x.trim();
                        });
                        var profile = {};
                        for (var fieldName in columnNumbersByFieldName) {
                            profile[fieldName] = row[columnNumbersByFieldName[fieldName]]?row[columnNumbersByFieldName[fieldName]]:'';
                        }
                        if (!profile['public_id']) {
                            continue;
                        }
                        profile['public_id'] = profile['public_id'].replace(/^.+\/in\//, '').replace(/\/$/, '').trim();
                        var profileBasic = await workflow.parseProfileBasic(profile['public_id']);
                        for (var profileFieldName in profileBasic) {
                            if (!profile[profileFieldName]) {
                                profile[profileFieldName] = profileBasic[profileFieldName];
                            }
                        }
                        if (profile['entity_id']) {
                            profile['public_id'] = profileBasic['public_id'];
                            peopleList.push(profile);
                            $csvCollectedCount.find('number').text(peopleList.length);
                        }
                    }
                    $overlay.css('display', 'none');
                    $mapCsvWidget.find('button[data-modal-close]').click();
                    gotoCollectPeople(null, peopleList);
                });
            }
            reader.readAsText(fl);
        });
        $input.trigger("click");
    });

    $('a.change-plan-link').click(gotoPlans);

    var userSessionId = await getUserSessionId();
    if (userSessionId) {
       var session = await getCampaignSession();
        if (session) {
            if (session['campaign'] && (session['campaign']['name'] || session['campaign']['campaign_id'])) {
                restoreCampaignSession(session);
            }else {
                removeCampaignSession();
            }
        }else {
            buildCampaignList();
        }

        setInterval(function () {
            if ($campaignList.find('li.main-campaign__item').length) {
                checkMailbox();
                workflow.checkInvitations();
            }
        }, 300000);

        setInterval(function () {
            workflow.runTasks();
        }, 60000);

        setTimeout(function(){
            workflow.runTasks();
            checkMailbox();
            workflow.checkInvitations();
        }, 2000);
    }
});

async function buildCampaignList() {
    var json = await workflow.getCampaignList();
    $campaignList.attr('campaigns-limit', json['limit']);
    $campaignList.find('li.main-campaign__item').remove();
    if (json['campaign_list'].length) {
        for (var i = 0; i < json['campaign_list'].length; i++) {
            addCampaign(json['campaign_list'][i]);
        }
    }else {
        $('div.main-campaign__title p').text('No campaigns yet. Create your first campaign.');
    }
}

function addCampaign(campaign) {
    var $campaignLink = $('<a href="#">' + campaign['name'] + '<i class="icon-right-open"></i></a>');
    $campaignLink.addClass('main-campaign__item-select');
    var $campaignItem = $('<li/>').addClass('main-campaign__item').attr('campaign_id', campaign['id']).append($campaignLink).click(function(){
        loadCampaign(campaign['id']);
    });
    var $campaignStatusItem = $('<i/>').addClass('campaign-status');
    if (campaign.active > 0) {
        $campaignStatusItem.addClass('active').text('Active');
    }else {
        $campaignStatusItem.text('Not Active');
    }
    $campaignItem.append($campaignStatusItem);
    $campaignList.find('ul.main-campaign__list').append($campaignItem);
}

async function loadCampaign(campaignId, tabSelected = null) {
    var campaign = await workflow.getCampaign(campaignId);
    if (!campaign) {
        showMessage("Campaign not found");
        return;
    }
    if (campaign.stat) {
        updateCampaignStat(campaignId, campaign.stat);
    }
    if (!campaign) {
        showMessage('Campaign not found');
        return;
    }
    $saveCampaignLink.hide();
    $createCampaignLink.hide();
    $campaignList.hide();
    $h2Title.text(campaign.name);
    $navBack.show();
    $campaignDetail.attr('campaign_id', campaignId).attr('campaign_name', campaign.name);
    campaign.active = parseInt(campaign.active);
    var $runningCampaign = $('.campaign-running');
    $changeCampaignStatus.show().unbind('click').click(function(){
        var $this = $(this);
        workflow.editCampaign(campaignId, {'active': campaign.active?0:1}, function(response){
            if (response.errors) {
                showErrors(response.errors);
            }else {
                campaign.active = response.campaign_active;
                $this.change();
                showMessage('Campaign ' + (campaign.active ? 'started!' : 'stopped!'));
            }
        });
    }).unbind('change').change(function(){
        var $this = $(this);
        $this.text(campaign.active?'Stop Campaign':'Start Campaign');
        var $campaignStatusItem = $('li.main-campaign__item[campaign_id="' + campaignId + '"] i.campaign-status');
        if (campaign.active) {
            $this.addClass('active');
            $campaignStatusItem.addClass('active').text('Active');
            $runningCampaign.show();
        }else {
            $this.removeClass('active');
            $campaignStatusItem.removeClass('active').text('Not Active');
            $runningCampaign.hide();
        }
    }).change();

    $campaignDetail.find('div.user-plan name').text(campaign.plan.name);

    function changeLimit(item) {
        var limit = {};
        limit[item.id.indexOf('invitation') > -1?'invite':'message'] = item.value;
        workflow.updateLimit(limit, function(response){
            if (response.errors) {
                showErrors(response.errors);
                item.value = oldLimitValue;
            }else {
                showMessage('Limit has changed!');
            }
        });
    }

    var oldLimitValue = 0;
    $('input#number-invitations-limit').val(campaign.limits.invite).focus(function(){
        oldLimitValue = this.value;
    }).unbind('change').change(function(){
        changeLimit(this);
    });
    $('input#number-messages-limit').val(campaign.limits.message).focus(function(){
        oldLimitValue = this.value;
    }).unbind('change').change(function(){
        changeLimit(this);
    });
    loadCampaignMessages(campaign.messages);
    $editCampaignMessages.unbind('click').click(function(){
        $editCampaignMessages.hide();
        gotoMessages(campaign.messages, function(){

            function goBack() {
                $saveCampaignMessages.hide();
                $cancelCampaignMessages.hide();
                $messagesStep.hide();
                $editCampaignMessages.show();
                $campaignDetail.show();
                $h2Title.text(campaign.name);
                $navBack.unbind('click').click(gotoCampaignList);
            }

            $saveCampaignMessages.unbind('click').click(function(){
                var messages = collectCampaignMessages();
                workflow.editCampaign(campaignId, {'messages': messages}, function(response){
                    loadCampaignMessages(response.campaign.messages);
                    updateCampaignStat(campaignId);
                    goBack();
                    campaign.messages = response.campaign.messages;
                });
            });
            $cancelCampaignMessages.add($navBack).unbind('click').click(goBack);
        });
    });
    $addCampaignPeople.unbind('click').click(function(){
        gotoSearchPeople(campaignId);
    });

    if (tabSelected) {
        $('li a[aria-controls="tab-panel-' + tabSelected + '-default"]').parent().click();
        if (tabSelected == 'people') {
            $changeCampaignStatus.hide();
        }
    }
    $campaignDetail.show();

    loadCampaignPeople(campaign.profiles, true);
}

function loadCampaignMessages(messages) {
    var $messageContainer = $campaignDetail.find('div.message-container');
    $messageContainer.find('div.message span').text(messages.connection);
    $messageContainer.find('div.next-message').remove();
    for (i = 0; i < messages.followup.length; i ++) {
        followup = messages.followup[i];
        var messageTitle = i == 0?'Message':'Follow-up';
        messageTitle += ' ' + (followup.send_in_days > 0?followup.send_in_days + ' days':'on the same day') + ' after previous message';
        messageTitle += ' ' + (parseInt(messages.keep_sending_messages)?'even if replied':'if no reply');
        if (followup.send_immediately_when_replied > 0) messageTitle += ' (send immediately when replied)';
        var filesHtml = '';
        var attachmentIds = Object.keys(followup.attachments);
        for (var attachmentId in followup.attachments) {
            filesHtml += '<a target="_blank" href="' + followup.attachments[attachmentId] + '"><span class="cancel">' + basename(followup.attachments[attachmentId]) + '</span></a><br/><br/>';
        }
        $messageContainer.append('<div class="next-message">' +
            '<p class="message-desc">Message number ' + (i + 1) + '</p>' +
            '<div class="message">' +
            '<p class="message-title">' +
            messageTitle + '<br />' +
            '</p>' +
            '<span>' + followup.message + '</span>' +
            '</div>' +
            filesHtml +
            '</div>');
    }
}

function loadCampaignPeople(profiles, clear = false, full = true) {
    var $userListBody = $campaignDetail.find('div#tab-panel-people-default .user-body__list');
    if (clear) {
        $userListBody.html('');
    }
    for (var i = 0; i < profiles.length; i ++) {
        addProfileToList(profiles[i], $userListBody, full);
    }
    $('#search_people_input').unbind('input').on('input', function(){
        var searchValue = this.value.trim().toLowerCase();
        $userListBody.find('.user-body__item').each(function(){
            var $this = $(this);
            var userName = $this.find('.name').text().toLowerCase();
            if (userName.indexOf(searchValue) > -1) {
                $this.show();
            }else {
                $this.hide();
            }
        });
    });
    $('.users thead i.icon-sort-up, .users thead i.icon-sort-down').unbind('click').click(function(){
        var $this = $(this);
        var className1 = $this.hasClass('icon-sort-up')?'cancel':'check';
        var className2 = $this.parent().hasClass('invited')?'invited':'accepted';
        if (className1 == 'check') {
            $this.removeClass('icon-sort-down').addClass('icon-sort-up');
        }else {
            $this.removeClass('icon-sort-up').addClass('icon-sort-down');
        }
        var $collection = [[], []];
        $userListBody.find('.user-body__item').each(function(){
            var $this = $(this);
            var $elem = $($this[0].outerHTML);
            $elem.find('td.delete').bind('click', $._data($this.find('td.delete').get(0), "events").click[0].handler);
            $elem.bind('click', $._data(this, "events").click[0].handler);
            if ($this.find('td[class="' + className1 + ' ' + className2 + '"]').length) {
                $collection[0].push($elem);
            }else {
                $collection[1].push($elem);
            }
        });
        $userListBody.find('.user-body__item').remove();
        for (var i = 0; i <= 1; i ++) {
            for (j = 0; j < $collection[i].length; j ++) {
                var $item = $collection[i][j];
                $userListBody.append($item);
            }
        }
    });

    $('button.bx--search-close').click(function(){
        $userListBody.find('.user-body__item').show();
    })

    $('a#people-export').unbind('click').click(function(){
        workflow.exportCampaignPeople($campaignDetail.attr('campaign_id'));
    });
}

function setProfileInvited(profileId) {
    var $invitedCol = $('div#tab-panel-people-default .user-body__list .user-body__item[profile_id="' + profileId + '"] td.invited');
    if ($invitedCol.length) {
        $invitedCol.removeClass('cancel').addClass('check');
        $invitedCol.find('i').remove();
        $invitedCol.append($('<i/>').addClass('icon-ok-circled'));
    }
}

function setProfileAccepted(entityId) {
    var $acceptedCol = $('div#tab-panel-people-default .user-body__list .user-body__item[entity_id="' + entityId + '"] td.accepted');
    if ($acceptedCol.length) {
        $acceptedCol.removeClass('cancel').addClass('check');
        $acceptedCol.find('i').remove();
        $acceptedCol.append($('<i/>').addClass('icon-ok-circled'));
    }
}

function gotoCampaignList(){
    $peopleStep.hide();
    $campaignNameStep.hide();
    $saveCampaignLink.hide();
    $campaignList.show();
    $goNext.hide();
    $goBack.hide();
    $navBack.hide();
    $campaignDetail.hide();
    $progressBar.hide();
    $changeCampaignStatus.hide();
    $editCampaignMessages.hide();
    $addCampaignPeople.hide();
    $createCampaignLink.show();
    $h2Title.text('Campaign List');
    if ($campaignList.find('li.main-campaign__item').length == 0) {
        buildCampaignList();
    }
    removeCampaignSession();
}

function gotoCampaignName() {
    var campaignsLimit = $campaignList.attr('campaigns-limit');
    if ($('ul.main-campaign__list li.main-campaign__item').length >= campaignsLimit) {
        if (confirm('Maximum campaigns number for your plan is ' + campaignsLimit + '. Upgrade plan?')) {
            gotoPlans();
        }
        return;
    }
    $campaignList.hide();
    $messagesStep.hide();
    $createCampaignLink.hide();
    $campaignNameStep.show();
    $progressBar.show();
    $h2Title.text("Campaign's name");
    $goNext.unbind('click').click(gotoMessages);
    $goBack.unbind('click').click(gotoCampaignList);
    $goBack.show();
    $goNext.show();
    changeCurrentStep(0);
    saveCampaignSession(1);
}

function gotoMessages(messages = null, callback = null) {
    if ($campaignDetail.is(":visible") && messages && callback) {
        $campaignDetail.hide();
        $saveCampaignMessages.show();
        $cancelCampaignMessages.show();
        restoreMessages(messages);
        callback();
    }else {
        if (!$campaignName.val().trim()) {
            $campaignName.addClass('input-error');
            alert('Please enter campaign name');
            return false;
        }
        $campaignList.hide();
        $searchPeopleStep.hide();
        $createCampaignLink.hide();
        $progressBar.show();
        $campaignNameStep.hide();
        $searchPeopleStep.hide();
        $goNext.show().unbind('click').click(function(){
            gotoSearchPeople();
        });
        $goBack.show().unbind('click').click(gotoCampaignName);
        changeCurrentStep(1);
        saveCampaignSession(2);
        if ($('div.followup-message').length == 0) {
            restoreMessages();
        }
    }
    $messagesStep.show();
    $h2Title.text('Setup messages');
    CarbonComponents.watch();
}

async function gotoSearchPeople(campaignId) {
    var campaignExtraData = {};
    if (campaignId) {
        campaignExtraData = {'campaign_id': campaignId};
        $campaignDetail.hide();
        $addPeopleToCampaign.hide();
        $addCampaignPeople.hide();
        $goBack.add($navBack).unbind('click').click(function(){
            $navBack.unbind('click').click(gotoCampaignList);
            editPeopleCallback(campaignId);
        });
    }else {
        var error = false;
        $('div.main-text-area[id != "connection-message"] textarea').each(function () {
            if (!this.value.trim()) {
                $(this).addClass('input-error');
                if (!error) error = 'Please fill all the data';
            } else {
                $(this).removeClass('input-error');
            }
        });
        if (error) {
            alert(error);
            return;
        }
        $progressBar.show();
        $messagesStep.hide();
        changeCurrentStep(2);
        $goNext.hide();
        $goBack.unbind('click').click(gotoMessages);
    }
    $goBack.show();
    $peopleStep.hide();
    $saveCampaignLink.hide();
    $campaignList.hide();
    $createCampaignLink.hide();
    var searchUrl = await getCurrentUrl();
    if (searchUrl.indexOf(linkedinSearchUrl) > -1) {
        $addPeopleFromLinkedinSearch.hide();
        $addPeopleFromSalesNavigator.hide();
        var isSearchFilterVisible = await isSearchFilterVisib();
        if (isSearchFilterVisible) {
            $showLinkedinSearch.hide();
            $applyLinkedinSearch.show();
        } else {
            $showLinkedinSearch.show();
            $applyLinkedinSearch.hide();
        }
        $collectPeopleLink.show();
        showPeopleSearch(onPeopleSearch);
    }else if (searchUrl.indexOf(navigatorSearchUrl) > -1) {
        $addPeopleFromLinkedinSearch.hide();
        $addPeopleFromSalesNavigator.hide();
        $showLinkedinSearch.hide();
        $applyLinkedinSearch.hide();
        $collectPeopleLink.show();
    }else {
        $showLinkedinSearch.hide();
        $applyLinkedinSearch.hide();
        $collectPeopleLink.hide();
        $addPeopleFromLinkedinSearch.show();
        $addPeopleFromSalesNavigator.show();
    }
    $searchPeopleStep.show();
    $h2Title.text('Add People');
    saveCampaignSession(3, campaignExtraData);
}

async function gotoCollectPeople(searchUrl, people = null){
    var navigatorSearchApiUrl, filter, collectPeopleFunction;
    if (!people) {
        if (searchUrl.indexOf(navigatorSearchUrl) === 0) {
            filter = await getFromStore('navigate_search_api_url');
            if (!filter) {
                alert('Please user some search filters');
                return;
            }else if (filter.indexOf('doFetchHits:true') === -1) {
                alert('Please click "Search" button of search form first');
                return;
            }
            collectPeopleFunction = workflow.collectPeopleFromNavigator;
        }else {
            if (searchUrl.indexOf(linkedinSearchUrl) === -1) {
                alert('Please click "Show Linkedin Search" first');
                return false;
            }
            var filter = workflow.buildSearchFilter(searchUrl);
            if (!filter || (!filter['keywords'] && filter['filter'].length < 2)) {
                alert('Please add some search filters');
                showPeopleSearch(onPeopleSearch);
                return false;
            }
            collectPeopleFunction = workflow.collectPeople;
        }
    }
    var session = await getCampaignSession();
    $campaignList.hide();
    $searchPeopleStep.hide();
    $createCampaignLink.hide();
    if (!session.campaign.campaign_id) {
        $progressBar.show();
        changeCurrentStep(3);
    }

    if (!people) {
        collectPeopleFunction(filter, function (profile) {
            addProfileToList(profile);
        }, updateProfilesNumber, onCollectPeopleEnd);
    }else {
        for (var i = 0; i < people.length; i ++) {
            addProfileToList(people[i]);
        }
        updateProfilesNumber(people.length);
        onCollectPeopleEnd();
    }
    $peopleStep.show();
}

function addProfileToList(profile, $profileListBlock = null, full = true) {
    if (!$profileListBlock) {
        $profileListBlock = $peopleStep.find('.user-body__list');
    }
    var userFields;
    if (full) {
        userFields = ['entity_id', 'public_id', 'first_name', 'last_name', 'company', 'job_title', 'custom_snippet_1', 'custom_snippet_2', 'custom_snippet_3'];
    }else {
        userFields = Object.keys(profile);
    }
    var $profileItem = $profileListBlock.find('.user-body__item[entity_id="' + profile.entity_id + '"]');
    var shortUserCompany = profile.company && profile.company.length > 20?profile.company.substr(0, 20) + '...':profile.company;
    if ($profileItem.length) {
        $profileItem.find('.name span').text((profile.first_name + ' ' + profile.last_name).trim());
        $profileItem.find('.company').text(shortUserCompany);
        for (var i = 0; i < userFields.length; i ++) {
            $profileItem.find('input.' + userFields[i]).val(profile[userFields[i]]);
        }
        return;
    }
    var isCampaignLoaded = $campaignDetail.is(":visible");
    $profileItem = $('<tr/>').addClass('user-body__item').attr('entity_id', profile.entity_id).attr('data-modal-target', '#modal-user');
    if (profile.id) {
        $profileItem.attr('profile_id', profile.id);
    }
    var $userNameItem = $('<td/>').addClass('name');
    $userNameItem.append($('<img/>').attr('orig-src', profile.picture?profile.picture:'').attr('src', profile.picture?profile.picture:'images/user-no-photo.png').addClass('user-avatar').attr('width', isCampaignLoaded?35:50 + 'px').attr('height', isCampaignLoaded?35:50 + 'px'));
    $userNameItem.append($('<span/>').text((profile.first_name + ' ' + profile.last_name).trim()));
    $profileItem.append($userNameItem);
    $profileItem.append($('<td/>').addClass('company').text(shortUserCompany));
    if (isCampaignLoaded) {
        $profileItem.append($('<td/>').addClass(profile.invitation_sent_at?'check':'cancel').addClass('invited').html( '<i class="' + (profile.invitation_sent_at?'icon-ok-circled':'icon-cancel-circled') + '"></i>'));
        $profileItem.append($('<td/>').addClass(profile.accepted_at?'check':'cancel').addClass('accepted').html( '<i class="' + (profile.accepted_at?'icon-ok-circled':'icon-cancel-circled') + '"></i>'));
    }
    $profileItem.append($('<td/>').addClass('delete').html('<i class="icon-trash-empty"></i>').click(function(ev){
        removeProfile($profileItem);
        ev.stopPropagation();
    }));
    for (var i = 0; i < userFields.length; i ++) {
        $profileItem.append($('<input/>').attr('type', 'hidden').addClass(userFields[i]).val(profile[userFields[i]]));
    }
    $profileItem.click(function() {
        var $modalUser = $('div#modal-user');
        for (var i = 0; i < userFields.length; i ++) {
            $modalUser.find('#modal-profile-' + userFields[i]).val($profileItem.find('input.' + userFields[i]).val());
        }
        $modalUser.find('button.btn-open-profile').unbind('click').click(function(){
            chrome.tabs.create({url: linkedinDomain + '/in/' + profile.entity_id, active: true});
        });
        var $openConversationButton = $modalUser.find('button.btn-conversation');
        if (profile.thread_id) {
            $openConversationButton.show().unbind('click').click(function(){
                chrome.tabs.create({url: linkedinDomain + '/messaging/thread/' + profile.thread_id + '/', active: true});
            });
        }else {
            $openConversationButton.hide();
        }
        var $withDrawConversationButton = $modalUser.find('button.btn-withdraw');
        if (profile.invitation_id) {
            $withDrawConversationButton.show().unbind('click').click(function(){
                workflow.withdrawInvitation(profile.id, profile.invitation_id, function(success, errors){
                    if (errors.length) {
                        showErrors(errors);
                    }else if (success) {
                        if (removeProfile($profileItem, true)) {
                            $modalUser.find('button[data-modal-close]').click();
                        }
                    }else {
                        showMessage('Withdrawn has failed. Please try later');
                    }
                });
            });
        }else {
            $withDrawConversationButton.hide();
        }
        $modalUser.find('button.save').unbind('click').click(async function(){
            var changed = {};
            for (var i = 0; i < userFields.length; i ++) {
                var fieldName = userFields[i];
                var $field = $modalUser.find('#modal-profile-' + fieldName);
                if ($field.length) {
                    $field.val($field.val().trim());
                    $profileItem.find('input.' + fieldName).val($field.val());
                    if (profile[fieldName] === undefined && $field.val() === '') continue;
                    if (profile[fieldName] != $field.val()) {
                        profile[fieldName] = $field.val();
                        changed[fieldName] = profile[fieldName];
                    }
                }
            }
            $profileItem.find('.name').text((profile.first_name + ' ' + profile.last_name).trim());
            $profileItem.find('.company').text(profile.company);
            if ($profileItem.attr('profile_id') && Object.keys(changed).length > 0) {
                await workflow.editProfile($profileItem.attr('profile_id'), changed);
            }
            $modalUser.find('button[data-modal-close]').click();
        });
        $modalUser.find('button.btn-exclude').unbind('click').click(async function(){
            if (removeProfile($profileItem)) {
                $modalUser.find('button[data-modal-close]').click();
            }
        });
    })
    $profileListBlock.append($profileItem);

    async function removeProfile($p, confirmed = false) {
        if ($p.attr('profile_id') && $campaignDetail.attr('campaign_id')) {
            if (confirmed || confirm('Delete from campaign permanently ?')) {
                await workflow.deleteCampaignProfile($campaignDetail.attr('campaign_id'), $p.attr('profile_id'));
            }else {
                return false;
            }
        }
        $p.remove();
        $('.user-body__item[profile_id="' + $p.attr('profile_id') + '"]').remove();
        updateProfilesNumber();
        return true;
    }
}

function updateProfilesNumber(profilesCount = null) {
    if (!profilesCount) {
        $parentBlock = $peopleStep.is(":visible") ? $peopleStep : $campaignDetail;
        profilesCount = $parentBlock.find('.user-body__list .user-body__item').length;
    }
    $('span.result-collected__number').text(profilesCount);
    $('div.all-people number').text(profilesCount);
}

async function onCollectPeopleEnd() {
    var session = await getCampaignSession();
    if (session.campaign.campaign_id) {
        $addPeopleToCampaign.attr('campaign_id', session.campaign.campaign_id).show();
    }else {
        $saveCampaignLink.show();
    }
    $goBack.show().unbind('click').click(function () {
        gotoSearchPeople(session.campaign.campaign_id);
    });
}
async function saveCampaignSession(step, extraData = null){
    var session = await getCampaignSession();
    var campaign = $.extend(session?session['campaign']:{}, getCampaignData(step));
    if (extraData) {
        campaign = $.extend(campaign, extraData);
    }
    session = {'step': step, 'campaign': campaign};
    chrome.storage.local.set({'campaign_session': session});
}

function getCampaignSession(step){
    return new Promise(function(resolve, reject){
        chrome.storage.local.get('campaign_session', function(data) {
            var session = null;
            if (data['campaign_session']) {
                session = data['campaign_session'];
            }
            resolve(session);
        });
    });
}

function restoreCampaignSession(session) {
    if (session['step'] >= 1 && session['campaign']) {
        $('input#campaign-name').val(session['campaign']['name']);
    }
    if (session['step'] >= 2 && session['campaign']['messages']) {
        restoreMessages(session['campaign']['messages']);
    }
    switch(session['step']) {
        case 1:
            gotoCampaignName();
            break;
        case 2:
            gotoMessages();
            break;
        case 3:
            gotoSearchPeople(session['campaign']['campaign_id']);
            break;
        case 4:
            gotoSearchPeople();
            //gotoCollectPeople();
            break;
    }
}

async function restoreMessages(messages = null) {
    if (!messages) {
        session = await getCampaignSession();
        messages = session['campaign']['messages'];
    }
    $('div#messages-step div.followup-message').remove();
    if (messages) {
        $('div#messages-step div#connection-message textarea').val(messages['connection']);
        $('div#messages-step input.keep-sending-messages').prop('checked', messages['keep_sending_messages'] == '1'?true:false);
        var followup, messageNumber;
        for (var key in messages['followup']) {
            followup = messages['followup'][key];
            messageNumber = addFollowUpMessage(followup['message'], followup['send_in_days'], followup['send_immediately_when_replied'], followup['attachments'], followup['id']?followup['id']:null);
        }
    }
}

function getCampaignData(step) {
    var campaign = {};
    if (step > 1) {
        campaign['name'] = $('input#campaign-name').val().trim();
    }
    if (step > 2) {
        campaign['messages'] = collectCampaignMessages();
    }
    if (step > 4) {
        campaign['people'] = collectCampaignPeople();
    }
    return campaign;
}

function collectCampaignMessages() {
    var messages = {'connection': $('div#connection-message textarea').val().trim(), 'keep_sending_messages': $('div#messages-step input.keep-sending-messages').is(':checked')?1:0, 'followup': []};
    $('div.followup-message').each(function () {
        var $this = $(this);
        var messageNumber = $this.attr('message-number');
        var followup = {
            'message': $this.find('textarea').val().trim(),
            'send_in_days': $this.find('input.send-in-days').val(),
            'send_immediately_when_replied': $this.find('input.send-immediately-when-replied').is(':checked')?1:0,
            'attachments': attachmentList[messageNumber]?attachmentList[messageNumber]:[],
        }
        if ($this.attr('followup-id')) followup['id'] = $this.attr('followup-id');
        messages['followup'].push(followup);
    });
    return messages;
}

function collectCampaignPeople() {
    var people = [];
    $peopleStep.find('.user-body__list .user-body__item').each(async function () {
        var $this = $(this);
        var profile = {'entity_id': $this.find('input.entity_id').val(), 'first_name': $this.find('input.first_name').val(),
            'last_name': $this.find('input.last_name').val(), 'company': $this.find('input.company').val(), 'job_title': $this.find('input.job_title').val(), 'picture': $this.find('img.user-avatar').attr('orig-src'),
            'custom_snippet_1': $this.find('input.custom_snippet_1').val(), 'custom_snippet_2': $this.find('input.custom_snippet_2').val(), 'custom_snippet_3': $this.find('input.custom_snippet_3').val()};
        if ($this.attr('profile-id')) followup['profile_id'] = $this.attr('profile-id');
        if (profile['entity_id']) {
            people.push(profile);
        }
    });
    return people;
}

function removeCampaignSession(){
    chrome.storage.local.remove('campaign_session');
    $campaignName.val('');
    $('div.followup-message').remove();
    $('div#messages-step textarea').val('');
    $peopleStep.find('.user-body__list .user-body__item').remove();
    $('span.result-collected__number').text('');
}

function typeInTextarea(newText, el = document.activeElement) {
    const start = el.selectionStart
    const end = el.selectionEnd
    const text = el.value
    const before = text.substring(0, start)
    const after  = text.substring(end, text.length)
    el.value = (before + newText + after)
    el.selectionStart = el.selectionEnd = start + newText.length
    el.focus();
}

function addFollowUpMessage(message = null, sendInDays = null, sendImmediatelyWhenReplied = null, attachments = null, followupId = null) {
    var $afterItem = $($xDaysAfter.get(0).outerHTML);
    $afterItem.show();
    var $beforeItem = $('div.main-text-area').last();
    if ($beforeItem.next().hasClass('main-message__desc-block')) {
        $beforeItem = $beforeItem.next();
    }
    var followupNumber = $('div.followup-message').length + 1;
    var keepSendingMessages = $('div#messages-step input.keep-sending-messages').prop('checked');
    $afterItem.find('p.send-schedule-title').text('Send X days after ' + (followupNumber > 1?'previous message':"they've connected") + ' ' + (keepSendingMessages?'even if replied:':'if no reply') + ' (set 0 to message immediately)');
    var $sendImmediatelyInput = $afterItem.find('input.send-immediately-when-replied');
    if (followupNumber == 1) {
        $sendImmediatelyInput.parent().parent().hide();
    }
    if (!keepSendingMessages) {
        $sendImmediatelyInput.prop('checked', false).attr('disabled', 'disabled');
    }
    var $attachFileLink = $('<a href="#" class="attach-file"><i class="icon-attach"></i></a>');
    $attachFileLink.click(function(){
        var $messageItem = $(this).parent();
        var messageNumber = $messageItem.attr('message-number');
        var $input = $(document.createElement("input"));
        $input.attr("type", "file").attr('accept', 'image/*,.ai,.psd,.pdf,.doc,.docx,.csv,.zip,.rar,.ppt,.pptx,.pps,.ppsx,.odt,.rtf,.xls,.xlsx,.txt,.pub,.html,.7z,.eml');
        $input.change(async function(){
            var fl = this.files[0];
            if (attachmentList[messageNumber] && attachmentList[messageNumber][fl.name]) {
                showMessage('This file already exist!');
                return;
            }
            if (fl.size > 1048576) {
                showMessage('Attachment size must be under 1MB');
                return;
            }
            var attach = await workflow.createAttachment(fl);
            if (attach.url) {
                $messageItem.append(createAttachmentItem(fl.name, attach.url, messageNumber));
            }
        });
        $input.trigger("click");
        return false;
    });
    var $followUpBlock = $('<div/>');
    $followUpBlock.addClass('main-text-area').addClass('followup-message');
    $followUpBlock.attr('message-number', followupNumber);
    if (followupId) {
        $followUpBlock.attr('followup-id', followupId);
    }
    $followUpBlock.append($afterItem.get(0).outerHTML);
    $followUpBlock.append($attachFileLink);
    $followUpBlock.append($('div#connection-message').get(0).innerHTML);
    $senImmediatelyInput = $followUpBlock.find('input.send-immediately-when-replied');
    $senImmediatelyInput.attr('id', "send-immediately-message-" + followupNumber);
    $senImmediatelyInput.next().attr('for', "send-immediately-message-" + followupNumber);
    $followUpBlock.find('a.remove-followup').click(function(event){
        event.preventDefault();
        var $messageItem = $(this).parent().parent();
        $messageItem.remove();
        var messageNumber = $messageItem.attr('message-number');
        if (attachmentList[messageNumber]) {
            delete attachmentList[messageNumber];
        }
        doOnMessagesChange();
    });
    if (message) {
        $followUpBlock.find('textarea').val(message);
    }
    if (sendInDays) {
        $followUpBlock.find('input.send-in-days').val(sendInDays);
    }
    if (sendImmediatelyWhenReplied) {
        $followUpBlock.find('input.send-immediately-when-replied').prop('checked', sendImmediatelyWhenReplied == '1'?true:false);
    }
    if (attachments) {
        for (var attachmentId in attachments) {
            $followUpBlock.append(createAttachmentItem(basename(attachments[attachmentId]), attachments[attachmentId], followupNumber));
        }
    }
    $beforeItem.after($followUpBlock);
    doOnMessagesChange();
    return followupNumber;
}

function createAttachmentItem(fileName, fileUrl, messageNum) {
    if (!attachmentList[messageNum]) {
        attachmentList[messageNum] = {};
    }
    attachmentList[messageNum][fileName] = fileUrl;
    var $fileItem = $('<span><a target="_blank" href="' + fileUrl + '">' + fileName + '</a></span>');
    var $cancelFileItem = $('<i class="icon-cancel"></i></span>');
    $cancelFileItem.click(function(){
        $fileItem.remove();
        workflow.deleteAttachment(attachmentList[messageNum][fileName]);
        delete attachmentList[messageNum][fileName];
    });
    $fileItem.append($cancelFileItem);
    return $fileItem;
}

function changeCurrentStep(stepIndex) {
    $('li.bx--progress-step').each(function(index){
        var $this = $(this);
        if (index < stepIndex) {
            $this.removeClass('bx--progress-step--current').addClass('bx--progress-step--complete');
            $this.find('svg').remove();
            $this.prepend('<svg><path d="M8,1C4.1,1,1,4.1,1,8s3.1,7,7,7s7-3.1,7-7S11.9,1,8,1z M8,14c-3.3,0-6-2.7-6-6s2.7-6,6-6s6,2.7,6,6S11.3,14,8,14z"></path><path d="M7 10.8L4.5 8.3 5.3 7.5 7 9.2 10.7 5.5 11.5 6.3z"></path></svg>');
        }else if (index == stepIndex) {
            $this.removeClass('bx--progress-step--incomplete').addClass('bx--progress-step--current');
            $this.find('svg').remove();
            $this.prepend('<svg><path d="M 7, 7 m -7, 0 a 7,7 0 1,0 14,0 a 7,7 0 1,0 -14,0"></path></svg>');
        }else {
            $this.removeClass('bx--progress-step--complete').removeClass('bx--progress-step--current').addClass('bx--progress-step--incomplete');
            $this.find('svg').remove();
            $this.prepend('<svg><path d="M8 1C4.1 1 1 4.1 1 8s3.1 7 7 7 7-3.1 7-7-3.1-7-7-7zm0 13c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6z"></path></svg>');
        }
    });
}

function doOnMessagesChange(){
    if ($('div.followup-message').length > 0) {
        $('div.main-message__desc-block p.message').first().hide();
        $('div.main-message__desc-block p.message').last().show();
        $('#add-follow-up').text('Add Follow Up');
    }else {
        $('div.main-message__desc-block p.message').last().hide();
        $('div.main-message__desc-block p.message').first().show();
        $('#add-follow-up').text('Add Message');
    }
}

function onPeopleSearch() {
    $applyLinkedinSearch.show();
    $showLinkedinSearch.hide();
}

function checkMailbox() {
    workflow.checkMailbox(async function(){
        if ($campaignDetail.is(":visible") && $campaignDetail.attr('campaign_id')) {
            updateCampaignStat($campaignDetail.attr('campaign_id'));
        }
    });
}

async function updateCampaignStat(campaignId, stat = null) {
    if (!stat) {
        stat = await workflow.getCampaignStat(campaignId);
        if (!stat.success) {
            return;
        }
    }
    console.log("Stat", stat);
    var total = parseInt(stat.total);
    stat.messages_total = parseInt(stat.messages_total);
    $('div.stats-export div.all-people number').text(total);
    var connectionSentPercentage = total?Math.round(stat.invitations_sent / total * 100):0;
    var acceptedPercentage = total?Math.round(stat.accepted / total * 100):0;
    var messagesSentPercentage = total?Math.round(stat.messages_sent / stat.total * 100):0;
    var repliedPercentage = stat.messages_sent?Math.round(stat.replied / stat.messages_sent * 100):0;
    var $connectionSent = $('div.time-stats-progress div.progress-connection-sent');
    var $connectionSentGreen = $connectionSent.find('div.green.c100');
    var $connectionAccepted = $('div.time-stats-progress div.progress-connection-connected');
    var $connectionAcceptedGreen = $connectionAccepted.find('div.green.c100');
    var $messageSent = $('div.time-stats-progress div.progress-message-sent');
    var $messageReplied = $('div.time-stats-progress div.progress-message-replied:last');
    var $messageSentGreen = $messageSent.find('div.green.c100');
    var $messageRepliedGreen = $messageReplied.find('div.green.c100');
    $connectionSent.find('span number').text(connectionSentPercentage);
    $connectionSentGreen.attr('class', 'c100 green p' + connectionSentPercentage);
    $connectionSent.find('p.stats-progress__desc span number').text(stat.invitations_sent);
    $connectionAcceptedGreen.find('span number').text(acceptedPercentage);
    $connectionAcceptedGreen.attr('class', 'c100 green p' + acceptedPercentage);
    $connectionAccepted.find('p.stats-progress__desc span number').text(stat.accepted);
    $messageSent.find('span number').text(messagesSentPercentage);
    $messageSentGreen.attr('class', 'c100 green p' + acceptedPercentage);
    $messageSent.find('p.stats-progress__desc span number').text(stat.messages_sent);
    $messageRepliedGreen.attr('class', 'c100 green p' + messagesSentPercentage);
    $messageReplied.find('span number').text(repliedPercentage);
    $messageRepliedGreen.attr('class', 'c100 green p' + repliedPercentage);
    $messageReplied.find('p.stats-progress__desc span number').text(stat.replied);
}

function editPeopleCallback(campaignId, people = null) {
    removeCampaignSession();
    $searchPeopleStep.hide();
    $peopleStep.hide();
    $goBack.hide();
    $addPeopleToCampaign.hide();
    if ($campaignDetail.attr('campaign_id')) {
        $h2Title.text($campaignDetail.attr('campaign_name'));
        $campaignDetail.show();
        if (people) {
            loadCampaignPeople(people);
            updateCampaignStat($campaignDetail.attr('campaign_id'));
        }
    }else {
        loadCampaign(campaignId, 'people');
    }
    $addCampaignPeople.show();
}

function readCampaignPeopleNumber(defaultNumber) {
    return readCampaignNumber(defaultNumber, 'How many profiles to import?');
}

function readCampaignPeopleStartingFrom(defaultNumber) {
    var number = readCampaignNumber(defaultNumber, 'Starting from position') - 1;
    if (number < 0) number = 0;
    return number;
}

function readCampaignNumber(defaultNumber, title) {
    do {
        var answer = prompt(title, defaultNumber);
        if (answer === null) {
            return 0;
        }
        answer = parseInt(answer);
        if (isNaN(answer)) {
            alert('Please input correct number');
        }else {
            break;
        }
    }while (true);

    return answer;
}

function showConnectionsLimit(limitNumber) {
    var $div = $campaignDetail.find('div.connection-limits');
    $div.find('number').text(limitNumber);
    $div.show();
}

function showMessagesLimit(limitNumber) {
    var $div = $campaignDetail.find('div.messages-limits');
    $div.find('number').text(limitNumber);
    $div.show();
}

function getCsvDelimiter(headLine) {
    var delimiters = [',', ';', '\t'];
    var maxColNumber = 0;
    var headers, delimiter;
    for (var i = 0; i < delimiters.length; i ++) {
        headers = parseCsvRow(headLine, delimiters[i]);
        if (headers.length > maxColNumber) {
            delimiter = delimiters[i];
            maxColNumber = headers.length;
        }
    }
    return delimiter;
}

function parseCsvRow(line, delimiter) {
    var csv = [];
    var row = line.split(delimiter);
    var column;
    for (var i = 0; i < row.length; i ++) {
        if (i < row.length - 1 && /^"/.test(row[i]) && /"$/.test(row[i]) === false && /"$/.test(row[i + 1]) && /^"/.test(row[i + 1]) === false) {
            column = row[i] + delimiter + row[i + 1];
            i ++;
        }else {
            column = row[i];
        }
        csv.push(column.replace(/^"/, '').replace(/"$/, '').trim());
    }
    return csv;
}

function addslashes( str ) {
    return (str +'').replace(/([\\"'])/g, "\\$1").replace(/\0/g, "\\0");
}