import { parse, isValid } from "date-fns";

export function parseExcelDate(value: any): Date | null {
    if (!value) return null;

    // If already a JS Date
    if (value instanceof Date) return value;

    // If it's a number (Excel serial date)
    if (typeof value === "number") {
        const date = new Date((value - 25569) * 86400 * 1000);
        return isValid(date) ? date : null;
    }

    // If it's a string, try common formats
    if (typeof value === "string") {
        const formats = [
            "dd.MM.yyyy",
            "dd.MM.yy",
            "dd/MM/yyyy",
            "yyyy-MM-dd",
            "MM/dd/yyyy",
            "dd-MMM-yyyy",
            "dd-MM-yyyy"
        ];

        for (const f of formats) {
            const date = parse(value.trim(), f, new Date());
            if (isValid(date)) return date;
        }
    }

    return null;
}

export function calculateAging(inDate: Date): number {
    const diffTime = Math.abs(new Date().getTime() - inDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
