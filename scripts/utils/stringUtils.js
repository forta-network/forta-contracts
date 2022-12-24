/*********************************************************************************************************************
 *                                                        Strings                                                       *
 *********************************************************************************************************************/

const kebabize = (str) => {
    return str
        .split('')
        .map((letter, idx) => {
            return letter.toUpperCase() === letter ? `${idx !== 0 ? '-' : ''}${letter.toLowerCase()}` : letter;
        })
        .join('');
};

const camelize = (s) => s.replace(/-./g, (x) => x[1].toUpperCase());
const upperCaseFirst = (s) => s.replace(/^[a-z,A-Z]/, (x) => x[0].toUpperCase());

module.exports = {
    kebabize,
    camelize,
    upperCaseFirst,
};
