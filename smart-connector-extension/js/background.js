chrome.runtime.onMessage.addListener(function (content, sender, response) {
    if (content.action) {
        if (content.action == 'getUrl') {
            chrome.tabs.query({currentWindow: true, active: true}, function (tabs) {
                response(tabs[0].url);
            });
        }else if (content.action == 'showPeopleSearch') {
            chrome.tabs.query({currentWindow: true, active: true}, function (tabs) {
                if (tabs[0].url.indexOf(linkedinSearchUrl) > -1) {
                    showSearchFormCallback(tabs[0].id);
                    response(true);
                }else {
                    chrome.tabs.create({url: linkedinSearchUrl, 'selected': true}, function (tab) {
                        chrome.tabs.executeScript(tab.id, {file: "js/jquery.min.js"}, function () {
                            showSearchFormCallback(tab.id);
                            response(true);
                        });
                    });
                }
            });
        }else if (content.action == 'isSearchFilterVisible') {
            chrome.tabs.query({currentWindow: true, active: true}, async function (tabs) {
                var isFilterVisible = await showFilterVisible(tabs[0].id);
                response(isFilterVisible);
            });
        }else if (content.action == 'applyPeopleSearch') {
            chrome.tabs.query({currentWindow: true, active: true}, async function (tabs) {
                applySearch(tabs[0].id);
                response(true);
            });
        }else if (content.action == 'getServiceData') {
            chrome.tabs.query({currentWindow: true, active: true}, async function (tabs) {
                response(await fetchServiceData(content.tabId));
            });
        }else if (content.action == 'getPrimaryIdentity') {
            chrome.tabs.query({currentWindow: true, active: true}, async function (tabs) {
                response(await fetchPrimaryIdentity(tabs[0].id));
            });
        } else if (content.action == 'uploadFile') {
            chrome.tabs.query({currentWindow: true, active: true}, async function (tabs) {
                response(await uploadFile(content.url, tabs[0].id));
            });
        }else if (content.action == 'getUserSessionId') {
            chrome.storage.local.get('user_session_id', function(data) {
                response(data['user_session_id']?data['user_session_id']:null);
            });
        }else if (content.action == 'saveCurrentWidgetPosition') {
            chrome.storage.local.set({'widget_position': content.arg}, function(data){
                response(true);
            });
        }else if (content.action == 'saveCurrentLabelPosition') {
            chrome.storage.local.set({'label_position': content.arg}, function(data){
                response(true);
            });
        }
        else if (content.action == 'getCurrentWidgetPosition') {
            chrome.storage.local.get('widget_position', function(data) {
                response(data['widget_position']?data['widget_position']:null);
            });
        }else if (content.action == 'getCurrentLabelPosition') {
            chrome.storage.local.get('label_position', function(data) {
                response(data['label_position']?data['label_position']:null);
            });
        }else if (content.action == 'saveWidgetVisibility') {
            chrome.storage.local.set({'widget_visibility': content.arg}, function(data){
                response(true);
            });
        }else if (content.action == 'getWidgetVisibility') {
            chrome.storage.local.get('widget_visibility', function(data) {
                response(data['widget_visibility']);
            });
        }else if (content.action == 'getCookie' && content.name) {
            setTimeout(async function(){
                response(await fetchCookie(content.name, content.tabId));
            }, 0);
        }else if (content.action == 'redirect' && content.url) {
            chrome.tabs.query({currentWindow: true, active: true}, async function (tabs) {
                chrome.tabs.update(tabs[0].id, {url: content.url}, function() {
                    response(true);
                });
            });
        }
    }

    return true;
});

function uploadFile(fileUrl, tabId){
    return new Promise(function(resolve, reject){
        chrome.runtime.onMessage.addListener(function(msg, sender, reply){
            if (msg.fileurl) {
                chrome.runtime.onMessage.removeListener(arguments.callee);
                resolve({url: msg.fileurl});
            }
        });
        chrome.tabs.executeScript(tabId, {
            code: `
                var request = new XMLHttpRequest();
                request.open('GET', '${fileUrl}', true);
                request.responseType = 'blob';
                request.onload = function() {
                    objectURL = URL.createObjectURL(request.response);
                    chrome.runtime.sendMessage({fileurl: objectURL});                
                };
                request.send();
            `
        });
    });
}

function showFilterVisible(tabId) {
    return new Promise(function(resolve, reject){
        chrome.tabs.executeScript(tabId, {
            code: `
                [document.querySelectorAll('div.search-advanced-facets__layout').length > 0];
	        `
        }, function(isFilter) {
            resolve(isFilter == 'true');
        });
    });
}

function applySearch(tabId) {
    chrome.tabs.executeScript(tabId, {
        code: `
            $(function(){
                $('button[class*="filters-show-results-button"]').click();
            });    `
    });
}

function showSearchFormCallback(tabId) {
    chrome.tabs.executeScript(tabId, {
        code: `
	        $(function(){
			    var checkExist = setInterval(function() {
			    var $searchButton = $('button.search-filters-bar__all-filters,button[class*="search-reusables__filter"]');
                if ($searchButton.length) {
                    $('button.search-filters-bar__all-filters,button[class*="search-reusables__filter"]').click();
                    clearInterval(checkExist);
                    var currentSearchStatus = 'apply';
                    var checkSearchPanel = setInterval(function() {
                        var $searchPanel = $('div.search-reusables__side-panel-overlay');
                        if ($searchPanel.length) {
                            if (currentSearchStatus != 'show') {
                                currentSearchStatus = 'show'; 
                                sendMessage('current_search_status', currentSearchStatus);
                            }
                        }else {                         
                            if (currentSearchStatus != 'apply') {
                                currentSearchStatus = 'apply';
                                sendMessage('current_search_status', currentSearchStatus);
                            }
                        }
                    }, 500);
                }
            }, 100);
            
            function sendMessage(key, status) {
                chrome.runtime.sendMessage({current_search_status: status});
            }
		});			    `
    });
}

function fetchServiceData(tabId) {
    return new Promise(function(resolve, reject){
        chrome.tabs.executeScript(tabId, {
            code: `
                var serviceVersionItem = document.querySelector('meta[name="serviceVersion"]');
                var clientPageInstanceId = document.querySelector('meta[name="clientPageInstanceId"]');
                [serviceVersionItem?serviceVersionItem.getAttribute('content'):null, clientPageInstanceId?clientPageInstanceId.getAttribute('content'):null, window.screen.width, window.screen.height]              
	        `
        }, function(result) {
            var result = result[0];
            resolve({service_version: result[0], page_instance_id: result[1], width: result[2], height: result[3]});
        });
    });
}

function fetchPrimaryIdentity(tabId) {
    return new Promise(function(resolve, reject){
        chrome.tabs.executeScript(tabId, {
            code: `
                var primaryIdentity;
                var codeNodes = document.querySelectorAll('code');
                for (var i = 0; i < codeNodes.length; i++) {
                    try {
                        var json = JSON.parse(codeNodes[i].innerText.trim());
                    }catch (e) {
                        json = null;
                    }
                    if (json && json.primaryIdentity) {
                        primaryIdentity = json.primaryIdentity;
                    }
                } 
                [primaryIdentity];         
	        `
        }, function(result) {
            var result = result[0];
            resolve(result[0]);
        });
    });
}

function fetchCookie(name, tabId) {
    return new Promise(function(resolve, reject){
        chrome.tabs.executeScript(tabId, {
            code: `
                var name = '${name}';
                var cookieValue = null;
                var cookies = document.cookie.split(';');
                for (var i = 0; i < cookies.length; i++) {
                    var cookie = cookies[i].trim();
                    if (cookie.indexOf(name + '=') == 0) {
                        cookieValue = cookie.substring(name.length + 1, cookie.length).trim();
                    }
                }
                [cookieValue];         
	        `
        }, function(result) {
            var result = result[0];
            resolve(result[0]);
        });
    });
}