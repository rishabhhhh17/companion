// One clock style for every time Squibby shows ("9:12 am"): the notch's facts, Home's Latest review and the usage runway's
// reset times all say a time the same way (the M89 review: saved jobs said "12:00 PM" beside "9:12 am").

/** The clock as Squibby says it: "2:14 pm". */
export const shortClock = (d: Date): string => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(/\s+/g, " ");
/** The weekday as Squibby says it: "Tue". */
export const shortDay = (d: Date): string => d.toLocaleDateString("en-US", { weekday: "short" });
