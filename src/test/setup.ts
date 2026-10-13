import '@testing-library/jest-dom/vitest'

// jsdom lacks pointer capture, which sonner (toasts) and Radix use.
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
