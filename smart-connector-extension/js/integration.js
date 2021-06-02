$(async function(){
	var userSessionId = await sendAppMessage('getUserSessionId');
	var widgetPosition = await sendAppMessage('getCurrentWidgetPosition');
	if (!widgetPosition) {
		widgetPosition = {top: 50, left: 30};
	}
	var labelPosition = await sendAppMessage('getCurrentLabelPosition');
	if (!labelPosition) {
		labelPosition = {top: 10, left: 30};
	}
	var widgetWidth;
	var widgetHeight;
	if (userSessionId) {
		widgetWidth = '500px';
		widgetHeight = '690px';
	}else {
		widgetWidth = '400px';
		widgetHeight = '590px';
	}
	var $widget = $('<div/>').attr('id', 'smartconnector-body').css('width', widgetWidth).css('height', widgetHeight).css('z-index', 99999).css('position', 'fixed');
    $widget.css('top', widgetPosition.top).css('left', widgetPosition.left);
	var $widgetHeader = $('<header/>').css('cursor', 'move').css('text-align', 'center').css('background', '#d4d4d4').css('padding', '10px 0px');
	var $widgetCloseLink = $('<a class="close" style="cursor:pointer;display:inline-block;position: absolute;right: 15px;top: 16px;">&#10006;</a>');
	$widgetHeader.append('<h3 style="line-height: 35px;text-transform: uppercase;font-weight: 600;font-size: 16px;">Click To Drag</h3>').append($widgetCloseLink);
	$widget.append($widgetHeader).append('<iframe width="' + widgetWidth + '" height="' + widgetHeight + '" src="chrome-extension://' + chrome.runtime.id + '/' + (userSessionId?'index.html':'account.html') + '"></iframe>');
	var $widgetFooter = $widgetHeader.clone().css('margin-top', '-10px');
	$widgetFooter.find('a').remove();
	$widgetFooter.appendTo($widget);

	setObjectPosition($widget.get(0), widgetPosition);
	widgetPosition.top >= 0?$widgetFooter.hide():$widgetFooter.show();

	var $widgetLabel = $('<div/>').attr('id', 'smartconnector-label').append($('<img/>').attr('src', chrome.extension.getURL('/images/logo-mini.png')));
	$widgetLabel.css('position', 'absolute').css('z-index', 99999).css('position', 'fixed').css('cursor', 'pointer').css('box-shadow', 'rgba(0, 16, 98, 0.5) 0px 2px 12px 0px').css('border-radius', '50%').css('background', 'white');
	$widgetLabel.css('top', labelPosition.top).css('left', labelPosition.left);
	setObjectPosition($widgetLabel.get(0), labelPosition);

	$widgetLabel.mousedown(function(){
		var elemRect = $widgetLabel.get(0).getBoundingClientRect();
		$widgetLabel.attr('position-top', elemRect.top);
		$widgetLabel.attr('position-left', elemRect.left);
	}).mouseup(function(event){
		if (event.which != 1) {
			return;
		}
		var elemRect = $widgetLabel.get(0).getBoundingClientRect();
		if (elemRect.top == $widgetLabel.attr('position-top') && elemRect.left == $widgetLabel.attr('position-left')) {
			$widget.show();
			$widgetLabel.hide();
			sendAppMessage('saveWidgetVisibility', 1);
		}
	});

	$widgetCloseLink.click(function(){
		$widget.hide();
		$widgetLabel.show();
		sendAppMessage('saveWidgetVisibility', 0);
	});

	if (await sendAppMessage('getWidgetVisibility') === 0) {
		$widget.hide();
		$widgetLabel.show();
	}else {
		$widget.show();
		$widgetLabel.hide();
	}

	$('body').append($widget).append($widgetLabel);
	$widget.add($widgetLabel).draggable({
		iframeFix: true,
		start: function(event, ui) {
		},
		stop: function(event, ui) {
			var newPosition = setObjectPosition(this, ui.position);
			ui.position.top = newPosition.top;
			ui.position.left = newPosition.left;
			if (this.id == 'smartconnector-body') {
				var elemRect = $widget.get(0).getBoundingClientRect();
				elemRect.top >= 0?$widgetFooter.hide():$widgetFooter.show();
				sendAppMessage('saveCurrentWidgetPosition', ui.position);
			}else {
				$widget.hide();
				sendAppMessage('saveCurrentLabelPosition', ui.position);
			}
		}
	});
});

function sendAppMessage(action, args = []) {
	return new Promise(function(resolve, reject) {
		chrome.runtime.sendMessage({
			action: action,
			arg: args
		}, function (response) {
			resolve(response);
		});
	});
}

function setObjectPosition(obj, position) {
	position.top = parseInt(position.top);
	position.left = parseInt(position.left);
	var $obj = $(obj);
	var top = parseInt($obj.css('top'));
	var objectHeight = parseInt($obj.css('height'));
	var minTop = obj.id == 'smartconnector-body'?-objectHeight + 10:0;
	if (top < minTop || top > window.innerHeight) {
		$obj.css('top', top < minTop?minTop + 10:(!minTop?window.innerHeight - objectHeight - 10:window.innerHeight - 50));
	}
	var left = parseInt($obj.css('left'));
	var objectWidth = parseInt($obj.css('width'));
	var minLeft = obj.id == 'smartconnector-body'?-objectWidth + 50:0;
	if (left < minLeft || left > window.innerWidth - (!minLeft?objectWidth:50)) {
		$obj.css('left', left < minLeft?minLeft + 10:(!minLeft?window.innerWidth - objectWidth - 10:window.innerWidth - 50));
	}
	return {top: $obj.css('top'), left: $obj.css('left')};
}