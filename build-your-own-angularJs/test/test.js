function expect(x) {
    return {
        toBe: function (y) {
            console.info(x === y);
        },
        toThrow: function () {
            try {
                x();
                console.info(false);
            } catch (e) {
                console.info(true);
            }
        },
        toEqual: function (y) {
            console.info(x === y);
        }
    }
}

var scope = new Scope();

var counter = 0;
var destroyGroup = scope.$watchGroup([], function(newValues, oldValues, scope) {
    counter++;
});
destroyGroup();
scope.$digest();
expect(counter).toEqual(0);