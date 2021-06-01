var gAuthTabId;
chrome.runtime.onMessage.addListener(function(message){
    if (message == 'user_logged') {
    	chrome.tabs.executeScript({
    		code: `
    		    var profileData = JSON.parse($('input#profile').val());
    		    [profileData];
    		`
    	}, async function(profile){   
    		if (gAuthTabId) {
    			chrome.tabs.remove(gAuthTabId);
    		}
    		var profile = profile[0][0];
			var workflow = new Workflow();
			workflow.login({email: profile.email, password: profile.id, username: profile.name, provider: 'google'}, function(response){
				if (response.errors) {
					document.write('<h1>' + response.errors + '</h1>');
				}else if (response.session_id) {
					setUserSessionId(response.session_id, function(){
						chrome.tabs.update({url: linkedinDomain, active: true});
					});
				}else {
					alert('Something is wrong. Please try again later');
				}
			});
    		chrome.tabs.getCurrent(function(tab) {
    		    //chrome.tabs.remove(tab.id);
    		});
    	});
    }else if (message == 'login_failed') {
    	if (gAuthTabId) {
			chrome.tabs.remove(gAuthTabId);
		}
		chrome.tabs.getCurrent(function(tab) {
		    chrome.tabs.remove(tab.id);
		});
    }
});

chrome.tabs.create({'url': appMainUrl + '/google-auth.html'}, function(tab) {
	gAuthTabId = tab.id;
    chrome.tabs.executeScript(tab.id, {file: "js/jquery.min.js"}, function(){
    chrome.tabs.executeScript(tab.id, {
		code: `
		    $(function(){
		        $('input#profile').change(function(){
		            chrome.runtime.sendMessage('user_logged');
		        });
		        $('input#fail').change(function(){
		            chrome.runtime.sendMessage('login_failed');
		        });
		    });
		`
        });
    });
});