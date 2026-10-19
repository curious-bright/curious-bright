import { RegisterInput, LoginInput, SubmissionInput } from '@curious-bright/validation';

export type { RegisterInput, LoginInput, SubmissionInput };
export * from '@curious-bright/validation';

export enum Role {
  USER = 'USER',
  EXPERT = 'EXPERT',
  ADMIN = 'ADMIN'
}

export enum Status {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export enum AcademicLevel {
  ELEMENTARY = 'ELEMENTARY',
  MIDDLE_SCHOOL = 'MIDDLE_SCHOOL',
  HIGH_SCHOOL = 'HIGH_SCHOOL',
  COLLEGE = 'COLLEGE',
  GRADUATE = 'GRADUATE',
  PROFESSIONAL = 'PROFESSIONAL'
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  schoolName: string;
  role: Role;
  isVerified: boolean;
  organizationId: string | null;
  createdAt: Date;
}

export interface Submission {
  id: string;
  userId: string;
  title: string;
  description: string;
  fileUrl: string;
  academicLevel: AcademicLevel;
  status: Status;
  license: string;
  createdAt: Date;
  updatedAt: Date;
}
