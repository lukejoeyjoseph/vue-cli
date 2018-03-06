// config that are specific to --target app

module.exports = (api, options) => {
  api.chainWebpack(webpackConfig => {
    // only apply when there's no alternative target
    if (process.env.VUE_CLI_TARGET) {
      return
    }

    // HTML plugin
    const fs = require('fs')
    const htmlPath = api.resolve('public/index.html')
    const resolveClientEnv = require('../util/resolveClientEnv')
    webpackConfig
      .plugin('html')
        .use(require('html-webpack-plugin'), [
          Object.assign(
            fs.existsSync(htmlPath) ? { template: htmlPath } : {},
            // expose client env to html template
            { env: resolveClientEnv(options.baseUrl, true /* raw */) }
          )
        ])

    // copy static assets in public/
    webpackConfig
      .plugin('copy')
        .use(require('copy-webpack-plugin'), [[{
          from: api.resolve('public'),
          to: api.resolve(options.outputDir),
          ignore: ['index.html', '.DS_Store']
        }]])

    if (process.env.NODE_ENV === 'production') {
      // inject preload/prefetch to HTML
      const PreloadPlugin = require('../webpack/PreloadPlugin')
      webpackConfig
        .plugin('preload')
          .use(PreloadPlugin, [{
            rel: 'preload',
            include: 'initial',
            fileBlacklist: [/\.map$/, /hot-update\.js$/]
          }])

      webpackConfig
        .plugin('prefetch')
          .use(PreloadPlugin, [{
            rel: 'prefetch',
            include: 'asyncChunks'
          }])

      // minify HTML
      webpackConfig
        .plugin('html')
          .tap(([options]) => [Object.assign(options, {
            minify: {
              removeComments: true,
              collapseWhitespace: true,
              removeAttributeQuotes: true
              // more options:
              // https://github.com/kangax/html-minifier#options-quick-reference
            },
            // necessary to consistently work with multiple chunks via CommonsChunkPlugin
            chunksSortMode: 'dependency'
          })])

      // // Code splitting configs for better long-term caching
      // // This needs to be updated when upgrading to webpack 4
      // const CommonsChunkPlugin = require('webpack/lib/optimize/CommonsChunkPlugin')

      if (!options.dll) {
        webpackConfig.optimization
          .set('runtimeChunk', true)
          .set('splitChunks', {
            chunks: 'all'
          })

        // inline the manifest chunk into HTML
        webpackConfig
          .plugin('inline-manifest')
            .use(require('../webpack/InlineSourcePlugin'), [{
              include: /runtime~.*\.js$/
            }])

        // since manifest is inlined, don't preload it anymore
        webpackConfig
          .plugin('preload')
            .tap(([options]) => {
              options.fileBlacklist.push(/runtime~.*\.js$/)
              return [options]
            })
      }

      // DLL
      if (options.dll) {
        const webpack = require('webpack')
        const UglifyPlugin = require('uglifyjs-webpack-plugin')
        const getUglifyOptions = require('./uglifyOptions')
        const dllEntries = Array.isArray(options.dll)
          ? options.dll
          : Object.keys(api.service.pkg.dependencies)

        webpackConfig
          .plugin('dll')
            .use(require('autodll-webpack-plugin'), [{
              inject: true,
              inherit: true,
              path: 'js/',
              context: api.resolve('.'),
              filename: '[name].[hash:8].js',
              entry: {
                'vendor': [
                  ...dllEntries,
                  'vue-loader/lib/component-normalizer'
                ]
              },
              plugins: [
                new webpack.DefinePlugin(resolveClientEnv(options.baseUrl)),
                new UglifyPlugin(getUglifyOptions(options))
              ]
            }])
            .after('preload')
      }
    }
  })
}
