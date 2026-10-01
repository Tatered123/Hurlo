/* global Ultraviolet */
self.__uv$config = {
  prefix: "/service/uv/",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/vendor/uv/uv.handler.js",
  client: "/vendor/uv/uv.client.js",
  bundle: "/vendor/uv/uv.bundle.js",
  config: "/uv.config.js",
  sw: "/vendor/uv/uv.sw.js",
};
