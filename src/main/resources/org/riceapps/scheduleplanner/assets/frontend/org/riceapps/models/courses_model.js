/**
 * Provides methods for interacting with the catalog of all courses.
 */

goog.provide('org.riceapps.models.CoursesModel');

goog.require('goog.array');
goog.require('goog.string');
goog.require('goog.structs.Map');
goog.require('goog.structs.Set');
goog.require('org.riceapps.events.SchedulePlannerEvent');
goog.require('org.riceapps.models.CourseModel');
goog.require('org.riceapps.models.Model');
goog.require('org.riceapps.protocol.Messages');
goog.require('org.riceapps.util.CourseScheduleMatrix');

goog.scope(function() {
var CourseModel = org.riceapps.models.CourseModel;
var SchedulePlannerEvent = org.riceapps.models.SchedulePlannerEvent;


/**
 * @param {?org.riceapps.protocol.Messages.Courses=} opt_data
 * @extends {org.riceapps.models.Model}
 * @constructor
 */
org.riceapps.models.CoursesModel = function(opt_data) {
  goog.base(this);

  /** @private {!goog.structs.Map.<number, !CourseModel>} */
  this.courses_ = new goog.structs.Map();

  if (opt_data) {
    for (var i = 0; i < opt_data['courses'].length; i++) {
      var course = opt_data['courses'][i];
      this.courses_.set(course['courseId'], new CourseModel(course, this));
    }
  }

};
goog.inherits(org.riceapps.models.CoursesModel,
              org.riceapps.models.Model);
var CoursesModel = org.riceapps.models.CoursesModel;


/**
 * Returns the course with the given identifier, or null if no such course exists.
 * @param {number} id
 * @return {org.riceapps.models.CourseModel}
 */
CoursesModel.prototype.getCourseById = function(id) {
  return this.courses_.get(id, null);
};


/**
 * Returns all sections of the provided course (including the provided course itself).
 * @param {!org.riceapps.models.CourseModel} course
 * @return {!Array.<org.riceapps.models.CourseModel>}
 */
CoursesModel.prototype.getAllSections = function(course) {
  var keys = this.courses_.getKeys();
  var category = course.getCourseCategory();
  var sections = [];

  for (var i = 0; i < keys.length; i++) {
    var otherCourse = this.courses_.get(keys[i]);
    if (otherCourse.getCourseCategory() == category) {
      sections.push(otherCourse);
    }
  }

  return sections;
};


/**
 * Returns all crosslisted sections of the provided course (including the provided course itself).
 * @param {!org.riceapps.models.CourseModel} course
 * @return {!Array.<org.riceapps.models.CourseModel>}
 */
CoursesModel.prototype.getAllCrosslistedSections = function(course) {
  var keys = this.courses_.getKeys();
  var sections = [];

  for (var i = 0; i < keys.length; i++) {
    var otherCourse = this.courses_.get(keys[i]);
    if (otherCourse.isCrosslistedWith(course)) {
      sections.push(otherCourse);
    }
  }

  return sections;
};


/**
 * Returns up to opt_limit (default 250) courses matching the given search query and filters.
 * Excludes results present on calendar or playground if a user model is provided.
 * A user model must be provided for some filters to function properly.
 * @param {string} query
 * @param {org.riceapps.models.CourseModel.Filter} filters
 * @param {org.riceapps.models.UserModel=} opt_userModel
 * @param {number=} opt_limit
 * @return {!Array.<!org.riceapps.models.CourseModel>}
 */
CoursesModel.prototype.getCoursesByQuery = function(query, filters, opt_userModel, opt_limit) {
  /*
  // NOTE(mschurr): To enable "browsing" courses in search window, comment this out.
  if (query.length == 0) {
    return [];
  }
  */

  var limit = opt_limit || 250;
  var results = [];
  var keys = this.courses_.getKeys();
  var used = new goog.structs.Set();
  var matrix = null;

  if (opt_userModel && filters.hideConflicts) {
    matrix = new org.riceapps.util.CourseScheduleMatrix();
    matrix.setCourses(opt_userModel.getCoursesInSchedule());
  }

  // To search, loop through all courses...
  for (var i = 0; i < keys.length; i++) {
    var course = this.courses_.get(keys[i]);

    // Ensure that the course passes the filters.
    if (!course.passesFilters(filters, opt_userModel)) {
      continue;
    }

    // Ensure that the course matches the query in some way.
    if (course.getMatchScore(query) <= 0) {
      continue;
    }

    // Ensure that another section of the course is not already in the result set.
    var category = course.getCourseCategory();
    if (used.contains(category)) {
      continue;
    }

    // Ensure that the course (or some section of it) is not already present on the user's calendar or playground.
    if (opt_userModel) {
      if (this.userModelContainsCourse_(opt_userModel, course)) {
        continue;
      }
    }

    // Ensure that the course does not create conflicts.
    if (opt_userModel && filters.hideConflicts && matrix.hasConflictWith(course)) {
      continue;
    }

    // If we get here, the course matched the query so append it to the results.
    results.push(course);

    // And make sure to add the category so additional sections of the course will not be added to the result set.
    used.add(category);
  }

  // Lastly, sort the results in order by how well they matched the query.
  // Sorting Order: SCORE DESC, SUBJ ASC, COURSE NUMBER ASC
  results.sort(function(a, b) {
    if (a.getMatchScore(query) > b.getMatchScore(query)) {
      return -1;
    } else if (a.getMatchScore(query) < b.getMatchScore(query)) {
      return 1;
    } else {
      if (a.getSubject() == b.getSubject()) {
        return a.getCourseNumber() - b.getCourseNumber();
      } else {
        return goog.string.caseInsensitiveCompare(a.getSubject(), b.getSubject());
      }
    }
  });

  // Lastly, cut the results to match the user-requested limit.
  results = results.slice(0, limit);
  return results;
};


/**
 * Returns whether or not a user model contains a given course (or categorical equivalent of the given course).
 * @param {!org.riceapps.models.UserModel} userModel
 * @param {!org.riceapps.models.CourseModel} course
 * @return {boolean}
 * @private
 */
CoursesModel.prototype.userModelContainsCourse_ = function(userModel, course) {
  var playground = userModel.getCoursesInPlayground();
  var schedule = userModel.getCoursesInSchedule();
  var category = course.getCourseCategory();

  for (var i = 0; i < playground.length; i++) {
    if (playground[i].getCourseCategory() == category) {
      return true;
    }
  }

  for (var i = 0; i < schedule.length; i++) {
    if (schedule[i].getCourseCategory() == category) {
      return true;
    }
  }

  return false;
};


/**
 * @return {!goog.structs.Set.<string>}
 */
CoursesModel.prototype.getAllInstructorNames = function() {
  var set = new goog.structs.Set();
  var keys = this.courses_.getKeys();

  for (var i = 0; i < keys.length; i++) {
    var course = this.courses_.get(keys[i]);
    var instructors = course.getInstructors();

    for (var j = 0; j < instructors.length; j++) {
      set.add(instructors[j].getName());
    }
  }

  set.remove('');
  return set;
};


/**
 * @return {!goog.structs.Set.<string>}
 */
CoursesModel.prototype.getAllDepartments = function() {
  var set = new goog.structs.Set();
  var keys = this.courses_.getKeys();

  for (var i = 0; i < keys.length; i++) {
    var course = this.courses_.get(keys[i]);
    set.add(course.getSubject());
  }

  set.remove('');
  return set;
};


/**
 * @return {!goog.structs.Set.<string>}
 */
CoursesModel.prototype.getAllSchools = function() {
  var set = new goog.structs.Set();
  var keys = this.courses_.getKeys();

  for (var i = 0; i < keys.length; i++) {
    var course = this.courses_.get(keys[i]);
    set.add(course.getSchool());
    set.add(course.getCollege());
  }

  set.remove('');
  return set;
};

});  // goog.scope
