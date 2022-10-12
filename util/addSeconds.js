module.exports = function (date, numSeconds) {
    // TODO: Validate that this is a date

    date.setSeconds(date.getSeconds + numSeconds)

    return date
}