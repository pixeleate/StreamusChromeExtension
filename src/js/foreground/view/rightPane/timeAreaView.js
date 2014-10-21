﻿//  A progress bar which shows the elapsed time as compared to the total time of the current song.
define([
    'common/enum/playerState',
    'common/utility',
    'foreground/view/behavior/tooltip',
    'text!template/rightPane/timeArea.html'
], function (PlayerState, Utility, Tooltip, TimeAreaTemplate) {
    'use strict';

    var TimeAreaView = Backbone.Marionette.ItemView.extend({
        id: 'timeArea',
        className: 'timeArea',
        template: _.template(TimeAreaTemplate),
        
        templateHelpers: {
            totalTimeMessage: chrome.i18n.getMessage('totalTime')
        },

        events: {
            //  TODO: input vs change?
            'input @ui.timeRange:not(.disabled)': '_onInputTimeRange',
            //  TODO: mousewheel doesn't work on FF, consider wheel.
            //  TODO: What should I name this since updateTimeProgress is taken...?
            'mousewheel @ui.timeRange:not(.disabled)': '_mousewheelUpdateTimeProgress',
            'mousedown @ui.timeRange:not(.disabled)': '_startSeeking',
            'mouseup @ui.timeRange:not(.disabled)': '_seekToTime',
            'click @ui.elapsedTimeLabel': '_toggleShowRemainingTime'
        },
        
        ui: {
            timeProgress: '#timeArea-timeProgress',
            timeRange: '#timeArea-timeRange',
            elapsedTimeLabel: '#timeArea-elapsedTimeLabel',
            totalTimeLabel: '#timeArea-totalTimeLabel'
        },
        
        behaviors: {
            Tooltip: {
                behaviorClass: Tooltip
            }
        },
        
        streamItems: null,
        player: null,
        
        initialize: function () {
            this.streamItems = Streamus.backgroundPage.StreamItems;
            this.player = Streamus.backgroundPage.Player;

            this.listenTo(this.streamItems, 'remove reset', this._clearOnEmpty);
            this.listenTo(this.streamItems, 'add', this._enable);
            this.listenTo(this.streamItems, 'change:active', this._onStreamItemsChangeActive);
            this.listenTo(this.player, 'change:currentTime', this._onPlayerChangeCurrentTime);
            this.listenTo(this.player, 'change:state', this._stopSeeking);
        },

        onRender: function () {
            this.ui.timeRange.toggleClass('disabled', this.streamItems.length === 0);
            
            //  If a song is currently playing when the GUI opens then initialize with those values.
            //  Set total time before current time because it affects the range's max.
            this._setTotalTime();
            this._setCurrentTime(this.player.get('currentTime'));
            this._setElapsedTimeLabelTitle(this.model.get('showRemainingTime'));
        },
        
        _onInputTimeRange: function() {
            this._updateTimeProgress();
        },
        
        //  Allow the user to manual time change by click or scroll.
        _mousewheelUpdateTimeProgress: function (event) {
            var delta = event.originalEvent.wheelDeltaY / 120;
            var currentTime = parseInt(this.ui.timeRange.val());

            this._setCurrentTime(currentTime + delta);

            this.player.seekTo(currentTime + delta);
        },

        _startSeeking: function (event) {
            //  1 is primary mouse button, usually left
            if (event.which === 1) {
                this.model.set('autoUpdate', false);
            }
        },
        
        _stopSeeking: function () {
            //  Seek is known to have finished when the player announces a state change that isn't buffering / unstarted.
            var state = this.player.get('state');

            if (state == PlayerState.Playing || state == PlayerState.Paused) {
                this.model.set('autoUpdate', true);
            }
        },

        _seekToTime: function (event) {
            //  1 is primary mouse button, usually left
            if (event.which === 1) {
                //  Bind to progressBar mouse-up to support dragging as well as clicking.
                //  I don't want to send a message until drag ends, so mouseup works nicely. 
                var currentTime = parseInt(this.ui.timeRange.val());
                this.player.seekTo(currentTime);
            }
        },
        
        _toggleShowRemainingTime: function() {
            var showRemainingTime = this.model.get('showRemainingTime');
            //  Toggle showRemainingTime and then read the new state and apply it.
            this.model.save('showRemainingTime', !showRemainingTime);

            this._setElapsedTimeLabelTitle(!showRemainingTime);

            this._updateTimeProgress();
        },
        
        _setElapsedTimeLabelTitle: function (showRemainingTime) {
            var title = showRemainingTime ? chrome.i18n.getMessage('remainingTime') : chrome.i18n.getMessage('elapsedTime');
            this.ui.elapsedTimeLabel.attr('title', title);
        },
        
        _enable: function () {
            this.ui.timeRange.removeClass('disabled');
        },
        
        _clearOnEmpty: function () {
            if (this.streamItems.length === 0) {
                this._setTotalTime();
                this.ui.timeRange.addClass('disabled');
            }
        },
        
        _setCurrentTime: function (currentTime) {
            this.ui.timeRange.val(currentTime);
            this._updateTimeProgress();
        },

        _setTotalTime: function () {
            var totalTime = this._getCurrentSongDuration();
            this.ui.timeRange.prop('max', totalTime);
            this._updateTimeProgress();
        },
        
        _updateCurrentTime: function (currentTime) {
            if (this.model.get('autoUpdate')) {
                this._setCurrentTime(currentTime);
            }
        },

        //  Repaints the progress bar's filled-in amount based on the % of time elapsed for current song.
        //  Keep separate from render because render is based on the player's values and updateProgress is based on the progress bar's values.
        //  This is an important distinction because when the user is dragging the progress bar -- the player won't be updating -- but progress bar
        //  values need to be re-rendered.
        _updateTimeProgress: function () {
            var currentTime = parseInt(this.ui.timeRange.val());
            var totalTime = parseInt(this.ui.timeRange.prop('max'));

            //  Don't divide by 0.
            var progressPercent = totalTime === 0 ? 0 : currentTime * 100 / totalTime;
            this.ui.timeProgress.width(progressPercent + '%');
            
            if (this.model.get('showRemainingTime')) {
                //  Calculate the remaining time from the current time and show that instead.
                var remainingTime = totalTime - currentTime;
                this.ui.elapsedTimeLabel.text(Utility.prettyPrintTime(remainingTime));
            } else {
                this.ui.elapsedTimeLabel.text(Utility.prettyPrintTime(currentTime));
            }

            this.ui.totalTimeLabel.text(Utility.prettyPrintTime(totalTime));
        },

        //  Return 0 or active song's duration.
        _getCurrentSongDuration: function () {
            var duration = 0;

            if (this.streamItems.length > 0) {
                var activeStreamItem = this.streamItems.getActiveItem();
                duration = activeStreamItem.get('song').get('duration');
            }

            return duration;
        },
        
        _onPlayerChangeCurrentTime: function (model, currentTime) {
            this._updateCurrentTime(currentTime);
        },
        
        _onStreamItemsChangeActive: function(model, active) {
            if (active) {
                this._setTotalTime();
            }
        }
    });

    return TimeAreaView;
});