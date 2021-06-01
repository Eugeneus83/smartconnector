$(async function(){
	var userSessionId = await sendAppMessage('getUserSessionId');
	if (!userSessionId) {
		return;
	}

	var widgetPosition = await sendAppMessage('getCurrentWidgetPosition');
	if (!widgetPosition) {
		widgetPosition = {top: 50, left: 30};
	}
	var labelPosition = await sendAppMessage('getCurrentLabelPosition');
	if (!labelPosition) {
		labelPosition = {top: 10, left: 30};
	}
	var $widget = $('<div/>').attr('id', 'smartconnector-body').css('width', '500px').css('height', '690px').css('position', 'absolute').css('z-index', 99999).css('position', 'fixed');
    $widget.css('top', widgetPosition.top).css('left', widgetPosition.left);
	var $widgetHeader = $('<header/>').css('cursor', 'move').css('text-align', 'center').css('background', '#d4d4d4').css('padding', '10px 0px');
	var $widgetCloseLink = $('<a class="close" style="cursor:pointer;display:inline-block;position: absolute;right: 15px;top: 16px;">&#10006;</a>');
	$widgetHeader.append('<h3 style="line-height: 35px;text-transform: uppercase;font-weight: 600;font-size: 16px;">Click To Drag</h3>').append($widgetCloseLink);
	$widget.append($widgetHeader).append('<iframe width="500px" height="690px" src="chrome-extension://' + chrome.runtime.id + '/index.html"></iframe>');
	var $widgetFooter = $widgetHeader.clone().css('margin-top', '-10px');
	$widgetFooter.find('a').remove();
	$widgetFooter.appendTo($widget);

	setObjectPosition($widget.get(0), widgetPosition);
	widgetPosition.top >= 0?$widgetFooter.hide():$widgetFooter.show();

	var $widgetLabel = $('<div/>').attr('id', 'smartconnector-label').append($('<img/>').attr('src', 'data:image/png;base64,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'));
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