/**
 * A slide-in panel that displays search results and search filters.
 */

goog.provide('org.riceapps.views.SearchView');

goog.require('goog.Timer');
goog.require('goog.dom.TagName');
goog.require('goog.dom.classlist');
goog.require('goog.style');
goog.require('org.riceapps.events.SchedulePlannerEvent');
goog.require('org.riceapps.events.ViewEvent');
goog.require('org.riceapps.fx.Animation');
goog.require('org.riceapps.models.CourseModel');
goog.require('org.riceapps.utils.DomUtils');
goog.require('org.riceapps.views.DraggableView');
goog.require('org.riceapps.views.ToolbarView');
goog.require('org.riceapps.views.View');


goog.scope(function() {
var Animation = org.riceapps.fx.Animation;
var DomUtils = org.riceapps.utils.DomUtils;
var DraggableView = org.riceapps.views.DraggableView;
var CourseModel = org.riceapps.models.CourseModel;
var SchedulePlannerEvent = org.riceapps.events.SchedulePlannerEvent;
var ViewEvent = org.riceapps.events.ViewEvent;



/**
 * @extends {org.riceapps.views.View}
 * @constructor
 */
org.riceapps.views.SearchView = function() {
  goog.base(this);

  /** @private {Element} */
  this.resultsContainer_ = null;

  /** @private {Element} */
  this.filterContainer_ = null;

  /** @private {string} */
  this.lastQuery_ = '';

  /** @private {?CourseModel.Filter} */
  this.lastFilterValues_ = null;

  /** @private {?org.riceapps.views.SearchView.FilterElements} */
  this.filterElements_ = null;

  /** @private {Element} */
  this.cancelButton_ = null;

  /** @private {boolean} */
  this.directionsShown_ = false;

  /** @private {Element} */
  this.directionsElement_ = null;

  /** @private {org.riceapps.views.ToolbarView} */
  this.toolbarView_ = null;

  /** @private {number} */
  this.scrollRestore_ = 0;

  /** @private {Element} */
  this.columns_ = null;

  /** @private {Element} */
  this.resultsColumn_ = null;
};
goog.inherits(org.riceapps.views.SearchView,
              org.riceapps.views.View);
var SearchView = org.riceapps.views.SearchView;


/**
 * Represents the elements for the filters on this object.
 *
 * @typedef {{
 *   normal: !Element,
 *   d1: !Element,
 *   d2: !Element,
 *   d3: !Element,
 *   conflicts: !Element,
 *   full: !Element
 * }}
 */
SearchView.FilterElements;


/**
 * @enum {string}
 */
SearchView.Theme = {
  BASE: 'search-view',
  DIRECTIONS: 'search-view-directions',
  COLUMNS: 'search-view-columns',
  RESULTS: 'search-view-results',
  FILTERS: 'search-view-filters',
  RESULTS_CONTAINER: 'search-view-results-container'
};


/**
 * @param {!org.riceapps.views.ToolbarView} toolbarView
 */
SearchView.prototype.registerToolbarView = function(toolbarView) {
  this.toolbarView_ = toolbarView;
};


/**
 * @param {string} query
 */
SearchView.prototype.setQuery = function(query) {
  this.lastQuery_ = query;
  this.updateSearch();
};


/**
 * @override
 */
SearchView.prototype.createDom = function() {
  goog.base(this, 'createDom');
  goog.dom.classlist.add(this.getElement(), SearchView.Theme.BASE);

  var columns = goog.dom.createDom(goog.dom.TagName.DIV, SearchView.Theme.COLUMNS);
  goog.dom.appendChild(this.getElement(), columns);
  this.columns_ = columns;

  var results = goog.dom.createDom(goog.dom.TagName.DIV, SearchView.Theme.RESULTS);
  goog.dom.appendChild(columns, results);
  this.resultsColumn_ = results;

  var resultsContainer = goog.dom.createDom(goog.dom.TagName.DIV, SearchView.Theme.RESULTS_CONTAINER);
  goog.dom.appendChild(results, resultsContainer);
  this.resultsContainer_ = resultsContainer;

  this.filterContainer_ = goog.dom.createDom(goog.dom.TagName.DIV, SearchView.Theme.FILTERS);

  this.cancelButton_ = goog.dom.createDom(goog.dom.TagName.DIV, 'close-search-view');
  goog.dom.appendChild(this.filterContainer_, this.cancelButton_);

  goog.dom.appendChild(columns, this.filterContainer_);
  this.createFiltersDom(this.filterContainer_);

  // Directions
  var directionsSpan;
  this.directionsElement_ = goog.dom.createDom(goog.dom.TagName.DIV);
  goog.dom.classlist.add(this.directionsElement_, SearchView.Theme.DIRECTIONS);
  goog.dom.setTextContent(this.directionsElement_, 'No Results Found');
  goog.dom.appendChild(this.getElement(), this.directionsElement_);

  directionsSpan = goog.dom.createDom(goog.dom.TagName.SPAN);
  goog.dom.setTextContent(directionsSpan,
    'There are no courses in the database that match your search query and filters.');
  goog.dom.appendChild(this.directionsElement_, directionsSpan);

  this.showDirections_();
};


/**
 * @return {CourseModel.Filter}
 */
SearchView.prototype.getFilterValues = function() {
  function getFilterValue(element) {
    return goog.dom.getChildren(element)[0].checked;
  }

  return {
    normal: getFilterValue(this.filterElements_.normal),
    d1: getFilterValue(this.filterElements_.d1),
    d2: getFilterValue(this.filterElements_.d2),
    d3: getFilterValue(this.filterElements_.d3),
    indep: getFilterValue(this.filterElements_.indep),
    hideConflicts: getFilterValue(this.filterElements_.conflicts),
    hideFull: getFilterValue(this.filterElements_.full)
  };
};


/**
 * @param {!Element} container
 */
SearchView.prototype.createFiltersDom = function(container) {
  /** @type {!goog.structs.Map.<string, Array>} */
  var filterDetails = new goog.structs.Map();
  filterDetails.set('normal', ['nd' , '1', 'Non-Distribution', true]);
  filterDetails.set('d1', ['d[]', '1', 'Distribution 1', true]);
  filterDetails.set('d2', ['d[]', '2', 'Distribution 2', true]);
  filterDetails.set('d3', ['d[]', '3', 'Distribution 3', true]);
  filterDetails.set('indep', ['show_indep', '1', 'Independent Study', true]);
  filterDetails.set('conflicts', ['filter_conflicts', '1', 'Hide conflicts']);
  filterDetails.set('full', ['filter_full', '1', 'Hide full courses']);

  // var normal = DomUtils.createCheckbox('nd', '1', 'Non-Distribution', true);
  // var d1 = DomUtils.createCheckbox('d[]', '1', 'Distribution 1', true);
  // var d2 = DomUtils.createCheckbox('d[]', '2', 'Distribution 2', true);
  // var d3 = DomUtils.createCheckbox('d[]', '3', 'Distribution 3', true);
  // var conflicts = DomUtils.createCheckbox('filter_conflicts', '1', 'Hide conflicts');
  // var full = DomUtils.createCheckbox('filter_full', '1', 'Hide full courses');
  // credit hours
  // school
  // department
  // instructor

  function createCheckbox(name) {
    var value = filterDetails.get(name);
    var child = DomUtils.createCheckbox.apply(this, value);
    goog.dom.appendChild(container, child);
    return child;
  }

  this.filterElements_ = {
    normal: createCheckbox('normal'),
    d1: createCheckbox('d1'),
    d2: createCheckbox('d2'),
    d3: createCheckbox('d3'),
    indep: createCheckbox('indep'),
    conflicts: createCheckbox('conflicts'),
    full: createCheckbox('full')
  };

  this.lastFilterValues_ = this.getFilterValues();
};


/**
 * @override
 */
SearchView.prototype.enterDocument = function() {
  goog.base(this, 'enterDocument');
  this.hide(true);

  this.getHandler().
    listen(this.filterContainer_, goog.events.EventType.CHANGE, this.onFilterChange).
    listen(this.cancelButton_, goog.events.EventType.CLICK, this.onCloseSearchWithReset).
    listen(this, DraggableView.EventType.DRAGSTART, this.onChildDragStart_).
    listen(this, DraggableView.EventType.DRAGEND, this.onChildDragEnd_).
    listen(this, [ViewEvent.Type.CHILD_ADDED, ViewEvent.Type.CHILD_REMOVED], this.handleChildrenChanged_);
};


/**
 * @override
 */
SearchView.prototype.exitDocument = function() {
  goog.base(this, 'exitDocument');

  this.getHandler().
    unlisten(this.filterContainer_, goog.events.EventType.CHANGE, this.onFilterChange).
    unlisten(this.cancelButton_, goog.events.EventType.CLICK, this.onCloseSearchWithReset).
    unlisten(this, DraggableView.EventType.DRAGSTART, this.onChildDragStart_).
    unlisten(this, DraggableView.EventType.DRAGEND, this.onChildDragEnd_).
    unlisten(this, [ViewEvent.Type.CHILD_ADDED, ViewEvent.Type.CHILD_REMOVED], this.handleChildrenChanged_);
};


/**
 * @param {!DraggableView.Event} event
 * @private
 */
SearchView.prototype.onChildDragStart_ = function(event) {
  this.hide();

  if (this.toolbarView_) {
    this.toolbarView_.getSearchInput().blur();
  }
};


/**
 * @param {!DraggableView.Event} event
 * @private
 */
SearchView.prototype.onChildDragEnd_ = function(event) {
  this.show();
};


/**
 *
 */
SearchView.prototype.onCloseSearchWithReset = function() {
  this.onCloseSearch(true);
};


/**
 * @param {boolean=} opt_reset
 */
SearchView.prototype.onCloseSearch = function(opt_reset) {
  this.hide();

  if (opt_reset && this.toolbarView_) {
    this.toolbarView_.resetInput();
  } else if (this.toolbarView_) {
    this.toolbarView_.blurInput();
  }
};


/**
 *
 */
SearchView.prototype.onFilterChange = function() {
  this.lastFilterValues_ = this.getFilterValues();
  this.updateSearch();
};


/**
 *
 */
SearchView.prototype.updateSearch = function() {
  var event = new SchedulePlannerEvent(SchedulePlannerEvent.Type.UPDATE_SEARCH);
  event.query = this.lastQuery_;
  event.filters = this.lastFilterValues_;
  this.dispatchEvent(event);
};


/**
 * @override
 */
SearchView.prototype.show = function(opt_preventAnimation) {
  if (this.isShown()) {
    return;
  }

  if (!this.hasChildren()) {
    this.updateSearch();
  }

  goog.base(this, 'show', opt_preventAnimation);
  goog.style.setElementShown(this.getElementStrict(), true);

  if (!opt_preventAnimation) {
    Animation.perform(this.getElementStrict(), Animation.Preset.FADE_IN_RIGHT_BIG).then(goog.bind(function(element) {
      // Due to a bug in Chrome, the browser fails to recognize the area is scrollable after it has been hidden and reshown.
      // The workaround for this appears to be changing the overflow property to force the browser to recognize scrollability.
      goog.style.setStyle(this.resultsContainer_, {'overflow': 'hidden'});
      goog.Timer.callOnce(function() {
        // NOTE: Asynchronous because property changes only take effect after returning control to the browser.
        // We need to let the overflow hidden take effect before toggling overflow back to auto.
        goog.style.setStyle(this.resultsContainer_, {'overflow': 'auto'});
        this.resultsContainer_.scrollTop = this.scrollRestore_;
      }, 0, this);
      return element;
    }, this));
  }

  this.relayout();
};


/**
 * @override
 */
SearchView.prototype.hide = function(opt_preventAnimation) {
  if (!this.isInDocument() || this.isHidden()) {
    return;
  }

  goog.base(this, 'hide', opt_preventAnimation);
  this.scrollRestore_ = this.resultsContainer_.scrollTop;

  if (!opt_preventAnimation) {
    Animation.perform(this.getElementStrict(), Animation.Preset.FADE_OUT_RIGHT_BIG).
        then(Animation.hideElement);
  } else {
    goog.style.setElementShown(this.getElementStrict(), false);
  }
};


/**
 * @param {boolean} isLoading
 */
SearchView.prototype.setLoading = function(isLoading) {

};


/**
 * @param {!Array.<!org.riceapps.views.CourseSearchView>} results
 */
SearchView.prototype.setSearchResults = function(results) {
  this.removeChildren(true);

  for (var i = 0; i < results.length; i++) {
    this.addChild(results[i], true);
  }

  this.resultsContainer_.scrollTop = 0;
  this.scrollRestore_ = 0;
};


/**
 * @override
 */
SearchView.prototype.getContentElement = function() {
  return this.resultsContainer_;
};


/**
 * @param {!org.riceapps.events.ViewEvent} event
 * @private
 */
SearchView.prototype.handleChildrenChanged_ = function(event) {
  if (this.hasChildren()) {
    this.hideDirections_();
  } else {
    this.showDirections_();
  }
};


/**
 * @return {void}
 * @private
 */
SearchView.prototype.showDirections_ = function() {
  if (this.directionsShown_) {
    return;
  }

  goog.style.setElementShown(this.directionsElement_, true);
  this.directionsShown_ = true;
};


/**
 * @return {void}
 * @private
 */
SearchView.prototype.hideDirections_ = function() {
  if (!this.directionsShown_) {
    return;
  }

  goog.style.setElementShown(this.directionsElement_, false);
  this.directionsShown_ = false;
};


/** @override */
SearchView.prototype.relayout = function(opt_preventAnimation) {
  goog.base(this, 'relayout', opt_preventAnimation);
  window.console.log('SearchView.relayout');

  if (this.columns_ && this.resultsColumn_ && this.resultsContainer_) {
    var width = goog.style.getContentBoxSize(this.getElement()).width;
    goog.style.setStyle(this.columns_, {
      'width': width + 'px'
    });

    goog.style.setStyle(this.resultsColumn_, {
      'width': (width - 300) + 'px'
    });

    goog.style.setStyle(this.resultsContainer_, {
      'width': (width - 300) + 'px'
    });
  }
};


});  // goog.scope
