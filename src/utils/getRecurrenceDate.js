export function getNextDeliveryDate(currentDate, recurrence) {
  const date = new Date(currentDate);
  
  switch (recurrence) {
    case "WEEKLY":
      date.setDate(date.getDate() + 7);
      break;
    case "BI_WEEKLY":
      date.setDate(date.getDate() + 14);
      break;
    case "MONTHLY":
      date.setMonth(date.getMonth() + 1);
      break;
  }

  return date;
}