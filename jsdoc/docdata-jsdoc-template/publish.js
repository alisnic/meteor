/*global require: true */
(function () {
  'use strict';

  // This file receives data from JSDoc via the `publish` exported function,
  // and converts it into JSON that is written to a file.

  var fs = require('jsdoc/fs');
  var helper = require('jsdoc/util/templateHelper');

  var _ = require("underscore");
  var stringify = require("canonical-json");

  // This is the big map of name -> data that we'll write to a file.
  var dataContents = {};
  // List of just the names, which we'll also write to a file.
  var names = [];

  /**
   * Get a tag dictionary from the tags field on the object, for custom fields
   * like package
   * @param  {JSDocData} data The thing you get in the TaffyDB from JSDoc
   * @return {Object}      Keys are the parameter names, values are the values.
   */
  var getTagDict = function (data) {
    var tagDict = {};

    if (data.tags) {
      _.each(data.tags, function (tag) {
        tagDict[tag.title] = tag.value;
      });
    }

    return tagDict;
  };

  // Fix up a JSDoc entry and add it to `dataContents`.
  var addToData = function (entry) {
    _.extend(entry, getTagDict(entry));

    // strip properties we don't want
    entry.comment = undefined;
    entry.___id = undefined;
    entry.___s = undefined;
    entry.tags = undefined;

    // generate `.filepath` and `.lineno` from `.meta`
    if (entry.meta && entry.meta.path) {
      var packagesFolder = 'packages/';
      var index = entry.meta.path.indexOf(packagesFolder);
      if (index != -1 && !entry.isprototype) {
        var fullFilePath = entry.meta.path.substr(index + packagesFolder.length) + '/' + entry.meta.filename;
        entry.filepath = fullFilePath;
        entry.lineno = entry.meta.lineno;
      }
    }

    entry.meta = undefined;

    if (!entry.importfrompackage && entry.filepath) {
      entry.module = entry.filepath.split('/')[0];
    } else {
      entry.module = entry.importfrompackage;
    }

    names.push(entry.longname);
    dataContents[entry.longname] = entry;
  };

  /**
   Entry point where JSDoc calls us.  It passes us data in the form of
   a TaffyDB object (which is an in-JS database of sorts that you can
   query for records.

   @param {TAFFY} taffyData See <http://taffydb.com/>.
   @param {object} opts
   @param {Tutorial} tutorials
   */
  exports.publish = function(taffyData) {
    var data = helper.prune(taffyData);

    var namespaces = helper.find(data, {kind: "namespace"});

    // prepare all of the namespaces
    _.each(namespaces, function (namespace) {
      if (namespace.summary) {
        addToData(namespace);
      }
    });

    var properties = helper.find(data, {kind: "member"});

    _.each(properties, function (property) {
      if (property.summary) {
        addToData(property);
      }
    });

    // Callback descriptions are going to be embeded into Function descriptions
    // when they are used as arguments, so we always attach them to reference
    // them later.
    var callbacks = helper.find(data, {kind: "typedef"});
    _.each(callbacks, function (cb) {
      delete cb.comment;
      addToData(cb);
    });

    var functions = helper.find(data, {kind: "function"});
    var constructors = helper.find(data, {kind: "class"});

    // we want to do all of the same transformations to classes and functions
    functions = functions.concat(constructors);

    // insert all of the function data into the namespaces
    _.each(functions, function (func) {
      if (! func.summary) {
        // we use the @summary tag to indicate that an item is documented
        return;
      }

      func.options = [];
      var filteredParams = [];

      // Starting a param with `options.` makes it an option, not a
      // param.  Dot (`.`) in this case binds tighter than comma, so
      // `options.foo,bar` will create an option named `foo, bar`
      // (representing two options in the docs).  We process pipes so
      // that `options.foo|bar` also results in `foo, bar`.
      _.each(func.params, function (param) {
        param.name = param.name.replace(/,|\|/g, ", ");

        var splitName = param.name.split(".");

        if (splitName.length < 2 || splitName[0] !== "options") {
          // not an option
          filteredParams.push(param);
          return;
        }

        param.name = splitName[1];

        func.options.push(param);
      });

      func.params = filteredParams;

      // the entire unparsed doc comment.  takes up too much room in the
      // data file.
      delete func.comment;

      addToData(func);
    });

    // write full docs JSON
    var jsonString = stringify(dataContents, null, 2);
    var jsString = "module.exports = " + jsonString + ";";
    jsString = "// This file is automatically generated by JSDoc; regenerate it with scripts/admin/jsdoc/jsdoc.sh\n" + jsString;
    var docsDataFilename = "../data/data.js";
    fs.writeFileSync(docsDataFilename, jsString);

    // write name tree JSON
    jsonString = stringify(names.sort(), null, 2);
    var nameTreeFilename= "../data/names.json";
    fs.writeFileSync(nameTreeFilename, jsonString);
  };
})();
