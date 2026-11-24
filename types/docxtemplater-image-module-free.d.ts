declare module "docxtemplater-image-module-free" {
  interface ImageModuleOptions {
    centered?: boolean;
    getImage: (tagValue: unknown, tagName: string) => Buffer;
    getSize: (img: Buffer, tagValue: unknown, tagName: string) => [number, number];
  }
  export default class ImageModule {
    constructor(options: ImageModuleOptions);
  }
}
