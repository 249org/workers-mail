"use client";

import { useEffect, useState } from "react";
import { initialsOf } from "@/lib/format";

type Props = {
  name: string;
  src?: string | null;
  className?: string;
};

export function PersonAvatar({ name, src, className = "person-avatar" }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const photo = src && !failed;

  return (
    <span className={className}>
      {photo ? (
        // The filename is the person's name; decorative next to the visible label.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}
    </span>
  );
}
