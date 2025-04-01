"use client";

import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

type Props = {
  dateString: string;
  format?: string;
}

export function DateFormatter({ dateString, format: formatStr = 'dd MMM yyyy' }: Props) {
  try {
    const date = parseISO(dateString);
    return (
      <time dateTime={dateString}>
        {format(date, formatStr, { locale: es })}
      </time>
    );
  } catch (error) {
    return <span>{dateString}</span>;
  }
} 