import * as zlib from 'zlib';
import { PassThrough, Transform } from 'stream';

/**
 * @memberOf Jymfony.Component.HttpClient
 */
export default class DecodingStream extends Transform {
    constructor(encoding = __self.ENCODING_NONE, { onProgress } = {}) {
        super();

        let contentStream;
        switch (encoding) {
            case __self.ENCODING_DEFLATE:
                contentStream = zlib.createInflate();
                break;

            case __self.ENCODING_GZIP:
                contentStream = zlib.createGunzip();
                break;

            case __self.ENCODING_BROTLI:
                contentStream = zlib.createBrotliDecompress();
                break;

            case __self.ENCODING_NONE:
            default:
                contentStream = new PassThrough();
                contentStream.setMaxListeners(20);
        }

        /**
         * @type {Transform}
         *
         * @private
         */
        this._stream = contentStream;
        this._stream.on('data', data => this.push(data));

        /**
         * @type {function(currentSize: int): void}
         *
         * @private
         */
        this._onProgress = onProgress || (() => {});

        /**
         * @type {int}
         *
         * @private
         */
        this._current = 0;
    }

    /**
     * @inheritdoc
     */
    _destroy(error, callback) {
        this._stream.destroy();
        super._destroy(error, callback);
    }

    /**
     * @inheritdoc
     */
    _transform(chunk, encoding, callback) {
        this._stream.on('error', callback);
        this._stream.write(chunk, encoding, (err) => {
            if (!err) {
                try {
                    this._onProgress(this._current += chunk.length);
                } catch (e) {
                    err = e;
                }
            }

            this._stream.off('error', callback);
            callback(err, null);
        });
    }
}

Object.defineProperties(DecodingStream, {
    ENCODING_NONE: { writable: false, value: 'none' },
    ENCODING_BROTLI: { writable: false, value: 'br' },
    ENCODING_GZIP: { writable: false, value: 'gzip' },
    ENCODING_DEFLATE: { writable: false, value: 'deflate' },
});
