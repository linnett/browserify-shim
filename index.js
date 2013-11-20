'use strict';

var util         =  require('util')
  , format       =  require('util').format
  , through      =  require('through')
  , resolveShims =  require('./lib/resolve-shims')
  , debug        =  require('./lib/debug')
  ;

function requireDependencies(depends) {
  if (!depends) return '';

  return Object.keys(depends)
    .map(function (k) { return { alias: k, exports: depends[k] || null }; })
    .reduce(
      function (acc, dep) {
        return dep.exports 
          ? acc + 'global.' + dep.exports + ' = require("' + dep.alias + '");\n'
          : acc + 'require("' + dep.alias + '");\n';
      }
    , '\n; '
  );
}

function bindWindowWithExports(s, dependencies) {
  // purposely make module and define be 'undefined',
  // but pass a function that allows exporting our dependency from the window or the context
  
  return '(function browserifyShim(module, exports, define, browserify_shim__define__module__export__) {\n'
      + dependencies 
      + s
      + '\n}).call(global, undefined, undefined, undefined, function defineExport(ex) { module.exports = ex; });\n';
}

function bindWindowWithoutExports(s, dependencies) {
  // if a module doesn't need anything to be exported, it is likely, that it exports itself properly
  // therefore it is not a good idea to override the module here

  return '(function browserifyShim(module, define) {\n'
      + dependencies 
      + s
      + '\n}).call(global, module, undefined);\n';
}

function moduleExport(exp) {
  return format('\n; browserify_shim__define__module__export__(typeof %s != "undefined" ? %s : window.%s);\n', exp, exp, exp);
}

function wrap(content, config) {
  var exported = config.exports
      ? content + moduleExport(config.exports)
      : content
  , dependencies = requireDependencies(config.depends)
  , boundWindow = config.exports
      ? bindWindowWithExports(exported, dependencies)
      : bindWindowWithoutExports(exported, dependencies);

  return boundWindow;
}

var go = module.exports = function (file) {
  var content = '';
  var stream = through(write, end);
  return stream;

  function write(buf) { content += buf; }
  function end() {
    resolveShims(file, function (err, config) {
      if (err) return console.error(err);
      debug.inspect({ config: config });

      var transformed = config ? wrap(content, config) : content;

      stream.queue(transformed);
      stream.queue(null);
    });
  }
}

// Test
if (!module.parent && typeof window === 'undefined') {
  var file = require.resolve('./test/nodeps/extshim-redirect/vendor/non-cjs');
  var stream = go(file)
  stream.pipe(process.stdout);

  stream.write('console.log("beep boop");\n');
  stream.end();
}
