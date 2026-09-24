export class PhoneNumber {
  private readonly value: string;

  constructor(value: string) {
    const normalized = value.trim().replace(/[\s().-]/g, "");
    if (normalized !== "" && !/^\+?[0-9]{8,15}$/.test(normalized)) {
      throw new Error("Invalid phone number");
    }
    this.value = normalized;
  }

  getValue(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }
}
