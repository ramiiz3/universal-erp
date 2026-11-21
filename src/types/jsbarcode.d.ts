declare module "jsbarcode" {
  type JsBarcodeOptions = {
    format?: string
    lineColor?: string
    background?: string
    width?: number
    height?: number
    margin?: number
    displayValue?: boolean
    font?: string
    fontSize?: number
    textMargin?: number
  }

  function JsBarcode(
    element: SVGElement | HTMLCanvasElement | string,
    value: string,
    options?: JsBarcodeOptions,
  ): void

  export default JsBarcode
}
