const Conf = require('conf');
const pLimit = require('p-limit');
const assert = require('assert');

/*********************************************************************************************************************
 *                                                  Async safe Conf                                                  *
 *********************************************************************************************************************/
class AsyncConf extends Conf {
    constructor(conf) {
        /* TODO: uncomment when this is solved https://github.com/OpenZeppelin/openzeppelin-upgrades/issues/645
        if (conf.configName === '.cache-31337') {
            conf.configName = `.cache-31337_${process.pid}`;
        }
        */
        super(conf);
        this.limit = pLimit(1);
    }

    get(key) {
        return this.limit(() => super.get(key));
    }

    set(key, value) {
        return this.limit(() => super.set(key, value));
    }

    async getFallback(key, fallback) {
        const value = (await this.get(key)) || (await fallback());
        await this.set(key, value);
        return value;
    }

    async expect(key, value) {
        const fromCache = await this.get(key);
        if (fromCache) {
            assert.deepStrictEqual(value, fromCache);
            return false;
        } else {
            await this.set(key, value);
            return true;
        }
    }
}

module.exports = AsyncConf;
