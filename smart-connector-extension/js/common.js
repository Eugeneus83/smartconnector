function getUserSessionId() {
    return new Promise(function(resolve, reject){
        chrome.storage.local.get('user_session_id', function(data) {
            resolve(data['user_session_id']?data['user_session_id']:null);
        });
    });
}

function setUserSessionId(sessionId, callback) {
    chrome.storage.local.set({'user_session_id': sessionId}, callback);
}

function removeUserSessionId(callback) {
    chrome.storage.local.remove('widget_position');
    chrome.storage.local.remove('label_position');
    chrome.storage.local.remove('widget_visibility');
    chrome.storage.local.remove('user_session_id', callback);
}

function saveInStore(key, value) {
    var data = {};
    data[key] = value;
    chrome.storage.local.set(data);
}

function getFromStore(key) {
    return new Promise(function(resolve, reject){
        chrome.storage.local.get(key, function(data) {
            resolve(data[key]);
        });
    });
}

function deleteFromStore(key, callback) {
    chrome.storage.local.remove(key, callback);
}

function saveInStoreExpiry(key, value, seconds) {
    saveInStore(key, {value: value, expiry: Date.now() + 1000 * seconds});
}

async function getFromStoreExpiry(key, seconds) {
    var value = await getFromStore(key);
    if (!value) {
        return null;
    }else if (!value.expiry || value.expiry < Date.now()) {
        deleteFromStore(key);
        return null;
    }else {
        return value.value;
    }
}

function getCurrentUrl() {
    return new Promise(function(resolve, reject) {
        chrome.runtime.sendMessage({
            action: 'getUrl'
        }, function (response) {
            resolve(response);
        });
    });
}

function getCookie(cookieName) {
    return new Promise(function(resolve, reject) {
        chrome.tabs.getCurrent(function(tab){
            chrome.runtime.sendMessage({
                action: 'getCookie',
                name: cookieName,
                tabId: tab.id
            }, function (response) {
                resolve(response);
            });
        });
    });
}

function refreshWindow() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
        if (tabs.length && tabs[0].url) {
            chrome.tabs.update(tabs[0].id, {url: tabs[0].url});
        }
    });
}

function getCurrentTab() {
    return new Promise(function(resolve, reject){
        chrome.tabs.getCurrent(function(tab){
            resolve(tab);
        });
    });
}

function showPeopleSearch(callback) {
    return new Promise(function(resolve, reject) {
        chrome.runtime.sendMessage({
            action: 'showPeopleSearch'
        }, function (response) {
            if (callback && typeof callback == 'function') {
                callback();
            }
            resolve(response);
        });
    });
}

function isSearchFilterVisib() {
    return new Promise(function(resolve, reject) {
        chrome.runtime.sendMessage({
            action: 'isSearchFilterVisible'
        }, function (response) {
            resolve(response);
        });
    });
}

function applyPeopleSearch() {
    return new Promise(function(resolve, reject) {
        chrome.runtime.sendMessage({
            action: 'applyPeopleSearch'
        }, function (response) {
            resolve(response);
        });
    });
}

function updateWidgetPosition(position = null) {
    return new Promise(function(resolve, reject) {
        chrome.runtime.sendMessage({
            action: 'updateWidgetPosition',
            position: position
        }, function (response) {
            resolve(response);
        });
    });
}

function doUploadFile(fileUrl){
    return new Promise(function(resolve, reject) {
        chrome.runtime.sendMessage({
            action: 'uploadFile',
            url: fileUrl
        }, function (response) {
            resolve(response);
        });
    });
}

function redirect(url) {
    chrome.runtime.sendMessage({
        action: 'redirect',
        url: url
    });
}

async function getData(url = '', headers = {}, type = false) {
    if (!type) type = 'json';
    try {
        const response = await fetch(url, {
            method: 'GET', // *GET, POST, PUT, DELETE, etc.
            mode: 'cors', // no-cors, *cors, same-origin
            cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
            credentials: 'same-origin', // include, *same-origin, omit
            headers: headers,
            redirect: 'follow', // manual, *follow, error
            referrerPolicy: 'no-referrer' // no-referrer, *client
        });
        if (type == 'json') {
            return await response.json();
        } else if (type == 'text') {
            return await response.text();
        }
        if (type == 'blob') {
            return await response.blob();
        } else {
            return false;
        }
    } catch (error) {
        return false;
    }
}

async function postData(url = '', data, newHeaders = {}, raw = false) {
    return new Promise(async function(resolve, reject) {
        const req = new XMLHttpRequest();
        req.open("POST", url, true);
        for (var key in newHeaders) {
            req.setRequestHeader(key, newHeaders[key]);
        }
        req.send(data);

        req.onreadystatechange = async function() {
            if (this.readyState === XMLHttpRequest.DONE /*&& this.status === 200*/) {
                resolve(raw?req:JSON.parse(req.responseText));
            }
        }
    });
}

async function putData(url = '', data, headers = {}) {
    return new Promise(async function(resolve, reject) {
        const req = new XMLHttpRequest();
        req.open("PUT", url, true);
        for (var key in headers) {
            req.setRequestHeader(key, headers[key]);
        }
        req.send(data);
        req.onreadystatechange = async function() {
            if (this.readyState === XMLHttpRequest.DONE) {
                resolve(this.status);
            }
        }
    });
}

async function gotoPlans() {
    var userSessionId = await getUserSessionId();
    if (userSessionId) {
        window.open(billingPageUrl + '?sid=' + userSessionId, '_blank');
    }
}

function basename(path) {
    return path.split('/').reverse()[0].replace(/\?.+/, '').trim();
}

function showMessage(message = []) {
    setTimeout(function(){
        showAlert(message);
    }, 50);
}

function showErrors(errors = []) {
    setTimeout(function(){
        showAlert(errors.join("\n"));
    }, 50);
}

function fixedEncodeURIComponent (str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
        return '%' + c.charCodeAt(0).toString(16);
    });
}

function showAlert(text, offsetY = 0) {
    var topMargin = offsetY?offsetY:($('body').height() / 2);
    new Attention.Alert({
        title: 'SmartConnector.org says',
        content: text
    });
    $('.attention-component').css('top', topMargin  + 'px');
    var $content = $('.attention-component .inner-container .content');
    $content.html($content.html().replace('&lt;br/&gt;', '<br/>'));
}