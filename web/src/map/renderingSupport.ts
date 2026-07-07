export const MAP_RENDERING_UNAVAILABLE_MESSAGE =
  'Interactive maps require browser graphics acceleration with WebGL2 support. Turn on graphics acceleration or WebGL in your browser settings, then reload this page.'

export function isMapRenderingSupported() {
  if (typeof document === 'undefined') return true

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2')
    context?.getExtension('WEBGL_lose_context')?.loseContext()
    return Boolean(context)
  } catch (err) {
    console.error('Failed to check browser map rendering support', err)
    return false
  }
}
