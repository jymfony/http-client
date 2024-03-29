const ClientException = Jymfony.Contracts.HttpClient.Exception.ClientException;
const DecodingException = Jymfony.Contracts.HttpClient.Exception.DecodingException;
const RedirectionException = Jymfony.Contracts.HttpClient.Exception.RedirectionException;
const ServerException = Jymfony.Contracts.HttpClient.Exception.ServerException;
const TransportException = Jymfony.Contracts.HttpClient.Exception.TransportException;

/**
 * @memberOf Jymfony.Component.HttpClient.Response
 */
class CommonResponseTrait {
    __construct() {
        /**
         * @type {*}
         *
         * @private
         */
        this._decodedData = null;
    }

    /**
     * @inheritdoc
     */
    async getStatusCode() {
        if (this._initializer) {
            await this._initialize();
        }

        return this.getInfo('http_code');
    }

    /**
     * @inheritdoc
     */
    async getDecodedContent(Throw = true) {
        if (null !== this._decodedData) {
            return this._decodedData;
        }

        const headers = await this.getHeaders(Throw);
        const contentType = headers['content-type'] ? headers['content-type'][0] : '';

        if (String(contentType).match(/^(?:text|application)\/(?:.+\+)?json$/)) {
            /**
             * @type {Buffer}
             */
            const content = await this.getContent(false);
            if (undefined === content) {
                throw new TransportException('Cannot be decoded: buffering is disabled.');
            }

            if (0 === content.length) {
                throw new DecodingException('Response body is empty.');
            }

            try {
                this._decodedData = JSON.parse(content.toString());
            } catch (e) {
                throw new DecodingException(__jymfony.sprintf('Cannot decode content: %s', e.message), 0, e);
            }
        }

        if (null === this._decodedData) {
            throw new DecodingException(__jymfony.sprintf('Cannot decode content of type %s', contentType));
        }

        return this._decodedData;
    }

    /**
     * @private
     */
    async _initialize() {
        const error = this.getInfo('error');
        if (null !== error) {
            throw new TransportException(error);
        }

        try {
            if (await this._initializer(this)) {
                await this._perform();
            }
        } catch (e) {
            // Persist timeouts thrown during initialization
            this._info.error = e.message;
            await this.close();

            throw new TransportException(e.message, null, e);
        }

        this._initializer = null;
    }

    /**
     * @private
     */
    async _pipeline(input, output) {
        let rejectionFn, resolveFn, resolved = false;

        try {
            await new Promise((resolve, reject) => {
                rejectionFn = err => {
                    if (resolved) {
                        return;
                    }

                    resolved = true;
                    reject(err);
                };

                resolveFn = () => {
                    if (resolved) {
                        return;
                    }

                    resolved = true;
                    resolve();
                };

                input.on('error', rejectionFn);
                output.on('error', rejectionFn);

                input.on('end', resolveFn);
                input.on('complete', resolveFn);
                output.on('finish', resolveFn);
                input.pipe(output);
            });
        } finally {
            output.removeListener('finish', resolveFn);
            input.removeListener('end', resolveFn);
            input.removeListener('complete', resolveFn);
            input.removeListener('error', rejectionFn);
            output.removeListener('error', rejectionFn);
        }

        return output;
    }

    /**
     * @private
     */
    _checkStatusCode() {
        const code = this.getInfo('http_code');
        let e = null;
        if (500 <= code) {
            e = new ServerException(this);
        } else if (400 <= code) {
            e = new ClientException(this);
        } else if (300 <= code) {
            e = new RedirectionException(this);
        }

        if (null !== e) {
            this._abortController = null;
            if (this._timeout) {
                clearTimeout(this._timeout);
            }

            throw e;
        }
    }
}

export default getTrait(CommonResponseTrait);
