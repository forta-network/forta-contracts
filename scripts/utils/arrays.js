/*********************************************************************************************************************
 *                                                        Arrays                                                     *
 *********************************************************************************************************************/
Array.range = function (start, stop = undefined, step = 1) {
    if (!stop) {
        stop = start;
        start = 0;
    }
    return start < stop
        ? Array(Math.ceil((stop - start) / step))
              .fill()
              .map((_, i) => start + i * step)
        : [];
};

Array.prototype.chunk = function (size) {
    return Array.range(Math.ceil(this.length / size)).map((i) => this.slice(i * size, i * size + size));
};
