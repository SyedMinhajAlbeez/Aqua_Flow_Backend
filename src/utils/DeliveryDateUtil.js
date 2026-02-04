/**
 * Utility class for managing subscription delivery dates and recurrence calculations
 */
class DeliveryDateUtil {
  /**
   * Recurrence frequency types supported by the system
   */
  static RecurrenceType = {
    WEEKLY: "WEEKLY",
    BI_WEEKLY: "BI_WEEKLY",
    MONTHLY: "MONTHLY",
  };

  /**
   * Maps recurrence types to their day increments
   */
  static #RECURRENCE_DAY_MAP = {
    WEEKLY: 7,
    BI_WEEKLY: 14,
    MONTHLY: null, // Uses month arithmetic instead
  };

  /**
   * Prevents instantiation of utility class
   * @throws {Error} DeliveryDateUtil is a static utility class
   */
  constructor() {
    throw new Error("DeliveryDateUtil is a static utility class and cannot be instantiated");
  }

  /**
   * Calculates the next delivery date based on recurrence type
   * @param {Date|string} currentDate - The current delivery date (Date object or ISO string)
   * @param {string} recurrence - The recurrence type (WEEKLY, BI_WEEKLY, or MONTHLY)
   * @returns {Date} The calculated next delivery date
   * @throws {Error} If recurrence type is invalid or date is invalid
   *
   * @example
   * const nextDate = DeliveryDateUtil.getNextDeliveryDate("2026-02-04", "WEEKLY");
   */
  static getNextDeliveryDate(currentDate, recurrence) {
    const date = this.#normalizeDate(currentDate);
    this.#validateRecurrence(recurrence);

    const nextDate = new Date(date);

    if (recurrence === this.RecurrenceType.MONTHLY) {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else {
      const daysToAdd = this.#RECURRENCE_DAY_MAP[recurrence];
      nextDate.setDate(nextDate.getDate() + daysToAdd);
    }

    return nextDate;
  }

  /**
   * Calculates multiple next delivery dates for an array of subscriptions
   * @param {Array<{nextDeliveryDate: Date|string, recurrence: string}>} subscriptions
   * @returns {Array<{date: Date, recurrence: string}>} Array of dates with metadata
   * @throws {Error} If any subscription has invalid data
   *
   * @example
   * const results = DeliveryDateUtil.getNextDeliveryDates([
   *   { nextDeliveryDate: "2026-02-04", recurrence: "WEEKLY" },
   *   { nextDeliveryDate: "2026-02-04", recurrence: "MONTHLY" }
   * ]);
   */
  static getNextDeliveryDates(subscriptions) {
    if (!Array.isArray(subscriptions)) {
      throw new Error("subscriptions must be an array");
    }

    return subscriptions.map((sub, index) => {
      try {
        return {
          date: this.getNextDeliveryDate(sub.nextDeliveryDate, sub.recurrence),
          recurrence: sub.recurrence,
          index,
        };
      } catch (error) {
        throw new Error(`Error processing subscription at index ${index}: ${error.message}`);
      }
    });
  }

  /**
   * Calculates delivery dates for multiple iterations into the future
   * @param {Date|string} startDate - The starting delivery date
   * @param {string} recurrence - The recurrence type
   * @param {number} iterations - Number of future deliveries to calculate
   * @returns {Array<Date>} Array of upcoming delivery dates
   * @throws {Error} If inputs are invalid or iterations is not a positive integer
   *
   * @example
   * const next12Months = DeliveryDateUtil.getUpcomingDeliveries("2026-02-04", "MONTHLY", 12);
   */
  static getUpcomingDeliveries(startDate, recurrence, iterations) {
    if (!Number.isInteger(iterations) || iterations < 1) {
      throw new Error("iterations must be a positive integer");
    }

    const dates = [];
    let currentDate = this.#normalizeDate(startDate);

    for (let i = 0; i < iterations; i++) {
      currentDate = this.getNextDeliveryDate(currentDate, recurrence);
      dates.push(new Date(currentDate));
    }

    return dates;
  }

  /**
   * Calculates days until the next delivery date
   * @param {Date|string} nextDeliveryDate - The next scheduled delivery date
   * @returns {number} Number of days until delivery (negative if date is in the past)
   * @throws {Error} If date is invalid
   *
   * @example
   * const daysUntil = DeliveryDateUtil.getDaysUntilDelivery("2026-02-11");
   */
  static getDaysUntilDelivery(nextDeliveryDate) {
    const date = this.#normalizeDate(nextDeliveryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nextDate = new Date(date);
    nextDate.setHours(0, 0, 0, 0);

    const diffTime = nextDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Gets the frequency label in a human-readable format
   * @param {string} recurrence - The recurrence type
   * @returns {string} Human-readable frequency label
   * @throws {Error} If recurrence type is invalid
   *
   * @example
   * const label = DeliveryDateUtil.getFrequencyLabel("BI_WEEKLY"); // "Every 2 weeks"
   */
  static getFrequencyLabel(recurrence) {
    this.#validateRecurrence(recurrence);

    const labels = {
      WEEKLY: "Every week",
      BI_WEEKLY: "Every 2 weeks",
      MONTHLY: "Every month",
    };

    return labels[recurrence];
  }

  /**
   * Validates if a recurrence type is supported
   * @param {string} recurrence - The recurrence type to validate
   * @returns {boolean} True if valid, false otherwise
   */
  static isValidRecurrence(recurrence) {
    return Object.values(this.RecurrenceType).includes(recurrence);
  }

  /**
   * Gets all supported recurrence types
   * @returns {Array<string>} Array of supported recurrence types
   *
   * @example
   * const types = DeliveryDateUtil.getSupportedRecurrenceTypes();
   * // ["WEEKLY", "BI_WEEKLY", "MONTHLY"]
   */
  static getSupportedRecurrenceTypes() {
    return Object.values(this.RecurrenceType);
  }

  /**
   * Normalizes input to a valid Date object
   * @private
   * @param {Date|string|number} dateInput - Date to normalize
   * @returns {Date} Normalized date
   * @throws {Error} If date is invalid
   */
  static #normalizeDate(dateInput) {
    
    const date = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);

    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateInput}`);
    }

    return date;
  }

  /**
   * Validates that recurrence type is supported
   * @private
   * @param {string} recurrence - The recurrence type to validate
   * @throws {Error} If recurrence type is not supported
   */
  static #validateRecurrence(recurrence) {
    if (!this.isValidRecurrence(recurrence)) {
      throw new Error(
        `Invalid recurrence type: ${recurrence}. Supported types: ${this.getSupportedRecurrenceTypes().join(", ")}`
      );
    }
  }
}

module.exports = DeliveryDateUtil;