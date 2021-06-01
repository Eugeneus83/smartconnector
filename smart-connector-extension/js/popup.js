$(async function(){
	var scraperTabs;
	var $signinForm = $('form#signinform');
	var $signupForm = $('form#signupform');
	var $helloForm = $('form#hello');
	var $confirmationForm = $('form#confirmation');
	var $forgotPasswordForm = $('form#forgot-password');
	var $resetPasswordForm = $('form#reset-password');
	var $signinLink = $('a#signin');
	var $signupLink = $('a#signup');
	var $signinMethods = $signinForm.find('.signin-methods');
	var $signinAccount = $signinForm.find('.main-sign-up__form');
	var $googleBtn = $signinForm.find('button.google');
	var $loginPasswordBtn = $signinForm.find('button.login-password');
	var $forgotPasswordLink = $('a#forgot-password');

	var confirmationEmail = getCookie('confirmation_email');
	if (confirmationEmail) {
		showConfirmation(confirmationEmail);
	}else {
		var resetPasswordEmail = getCookie('reset_password_email');
		if (resetPasswordEmail) {
			showResetPassword(resetPasswordEmail);
		}else {
			$signupForm.hide();
		}
	}

	var workflow = new Workflow();
	var userSessionId = await getUserSessionId();
	if (userSessionId) {
		$signinForm.hide();
		var response = await workflow.getUser();
		if (response.success == '1') {
			$helloForm.find('span.username').text(response.username);
			$('p.main-sing-up__title').hide();
			$helloForm.find('div.user-plan-box name').text(response.plan.name);
			$helloForm.show();
		}else {
			removeUserSessionId();
			$helloForm.hide();
			$confirmationForm.hide();
			$signinForm.show();
			showAlert('User not found, please login again');
		}
	}
	$signinLink.click(function(){
		$signinLink.css('color', '#008000');
		$signupLink.css('color', '#0000FF');
		$signinForm.show();
		$signupForm.hide();
		$signinMethods.show();
		$signinAccount.hide();
		$forgotPasswordForm.hide();
		$resetPasswordForm.hide();
		$confirmationForm.hide();
	});
	$signupLink.click(function(){
		$signupLink.css('color', '#008000');
		$signinLink.css('color', '#0000FF');
		$signupForm.show();
		$signinForm.hide();
		$forgotPasswordForm.hide();
		$resetPasswordForm.hide();
		$confirmationForm.hide();
	});
	$googleBtn.click(function(){
		chrome.tabs.create({url:'chrome-extension://' + chrome.runtime.id + '/gauth.html'});
	});
	$loginPasswordBtn.click(function(){
		$signinMethods.hide();
		$signinAccount.show();
		console.log("4444");
	});

	$signinForm.submit(function(){
		workflow.login({email: this.email.value.trim(), password: this.password.value.trim()}, function(response){
			if (response.errors) {
				showErrors(response.errors);
			}else {
				if (response.session_id) {
					setUserSessionId(response.session_id, function(){
						document.location.reload();
					})
				}else {
					showAlert('Something is wrong. Please try again later');
				}
			}
		});
		return false;
	});

	$signupForm.submit(function(){
		var $this = $(this);
		var email = this.email.value.trim();
		workflow.register(email, this.username.value.trim(), this.password.value.trim(), function(response){
			if (response.errors) {
				showErrors(response.errors);
			}else {
				if (response.session_id) {
					var confirmationEmail
					setCookie('confirmation_email', email, 15);
					showConfirmation(email);
				}
			}
		});
        return false;
	});

	$confirmationForm.submit(function(){
		workflow.confirm(this.code.value.trim(), function(response){
			if (response.errors) {
				showErrors(response.errors);
			}else {
				setCookie('confirmation_email', null, -1);
				$confirmationForm.hide();
				$signupForm.hide();
				$signinForm.show();
				showAlert('Account is created. You can login now');
			}
		});
		return false;
	});

	$helloForm.find('a.logout').click(function(){
		removeUserSessionId(function(){
			refreshWindow();
			document.location.reload();
		});
	});

	$helloForm.find('button.btn-launch').click(function(){
		chrome.tabs.create({url: linkedinDomain, active: true});
	});

	$forgotPasswordLink.click(function(){
		$signinForm.hide();
		$signupForm.hide();
		$forgotPasswordForm.show();
	});

	$forgotPasswordForm.submit(function(){
		var emailAddress = this.email.value.trim();
		workflow.resetPassword(emailAddress, function(response) {
			if (response.errors) {
				showErrors(response.errors);
			} else if (response.success == 1){
				setCookie('reset_password_email', emailAddress, 15);
				$forgotPasswordForm.hide();
				showResetPassword(emailAddress);
			}else {
				showAlert('Something is wrong. Please try again later');
			}
		});
		return false;
	});

	$resetPasswordForm.submit(function(){
		if (this.password.value != this.confirm_password.value) {
			showAlert('Passwords do not match');
		}else {
			workflow.updatePassword(this.code.value.trim(), this.email.value.trim(), this.password.value.trim(), function (response) {
				if (response.errors) {
					showErrors(response.errors);
				} else if (response.success == 1) {
					setCookie('reset_password_email', null, -1);
					$resetPasswordForm.hide();
					$signupForm.hide();
					$signinForm.show();
					showAlert('Password has changed. You can login now using new password');
				} else {
					showAlert('Something is wrong. Please try again later');
				}
			});
		}
		return false;
	});

	$('.btn-upgrade').click(gotoPlans);

	$('.sign-up-footer a').click(function(){
		if (this.href) {
			chrome.tabs.create({url: this.href, active: true});
		}
	});

	function showConfirmation(emailAddress) {
		$signupForm.hide();
		$signinForm.hide();
		$confirmationForm.find('label span.email').text(emailAddress).show();
		$confirmationForm.show();
	}

	function showResetPassword(emailAddress) {
		$signupForm.hide();
		$signinForm.hide();
		$resetPasswordForm.find('label span.email').text(emailAddress).show();
		$resetPasswordForm.find('input[name="email"]').val(emailAddress);
		$resetPasswordForm.show();
	}
});

function getCookie(name) {
	var cookies = document.cookie.split(';');
	for (var key in cookies) {
		var cookie = cookies[key].trim();
		if (cookie.indexOf(name + '=') == 0) {
			return cookie.substring(name.length + 1, cookie.length).trim();
		}
	}
	return false;
}

function setCookie(name, value, minutes) {
	let expirationDate = new Date(Date.now() + 60000 * minutes);
	expirationDate = expirationDate.toUTCString();
	document.cookie = name + '=' + value +'; path=/; expires=' + expirationDate;
}

function fetchUrl(url) {
	return new Promise(async function(resolve){
		fetch(url).then(r => r.text()).then(async function(responseText) {
		    resolve(responseText);
		});
	});
}

async function checkAuth() {
	var result = await fetchUrl('https://www.linkedin.com/in/' + randomString());
	if (isAuth(result)) {
		return 'auth';
	}else if (isLogged(result)) {
		return 'logged';
	}
	return false;
}

function isAuth(html) {
	if (html.indexOf('/authwall?') > -1 || html.indexOf('auth_wall_desktop_profile') > -1) {
		return true;
	}
	return false;
}

function isLogged(html) {
	if (html.indexOf('fs_miniProfile:') > -1) {
		return true;
	}
	return false;
}



function randomString(length) {
	var buf = new Uint8Array(15);
    window.crypto.getRandomValues(buf);
    return btoa(String.fromCharCode.apply(null, buf));
}
