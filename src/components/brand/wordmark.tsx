import { useId } from "react";

type Props = {
  size?: "sm" | "lg";
};

/** Wordmark lockup. Flat on Ink light; charcoal badge in Ink dark; violet badge on colour palettes. */
export function BrandLockup({ size = "sm" }: Props) {
  const uid = useId().replace(/:/g, "");
  const gradInk = `${uid}-ink`;
  const gradViolet = `${uid}-violet`;
  const clip = `${uid}-clip`;

  return (
    <svg
      className="brand-lockup"
      data-size={size}
      viewBox="0 0 220 45"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradInk} x1="23" y1="0.358" x2="23" y2="44.358" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2B2D2F" />
          <stop offset="1" stopColor="#131517" />
        </linearGradient>
        <linearGradient id={gradViolet} x1="23" y1="0.358" x2="23" y2="44.358" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8A50FF" />
          <stop offset="0.389" stopColor="#763CF3" />
        </linearGradient>
        <clipPath id={clip}>
          <rect x="1" y="0.358" width="44" height="44" rx="9.5" />
        </clipPath>
      </defs>

      <g className="brand-badge brand-badge-ink" clipPath={`url(#${clip})`}>
        <path
          d="M1.917 9.858C1.917 5.118 5.76 1.275 10.5 1.275h25c4.74 0 8.583 3.843 8.583 8.583v25c0 4.74-3.843 8.583-8.583 8.583h-25c-4.74 0-8.583-3.843-8.583-8.583v-25Z"
          fill="#1F2123"
        />
        <path
          d="M1.917 9.858C1.917 5.118 5.76 1.275 10.5 1.275h25c4.74 0 8.583 3.843 8.583 8.583v25c0 4.74-3.843 8.583-8.583 8.583h-25c-4.74 0-8.583-3.843-8.583-8.583v-25Z"
          stroke={`url(#${gradInk})`}
          strokeWidth="1.833"
        />
      </g>
      <g className="brand-badge brand-badge-violet" clipPath={`url(#${clip})`}>
        <rect x="1.917" y="1.275" width="42.167" height="42.167" rx="8.583" fill="#8046FD" />
        <rect
          x="1.917"
          y="1.275"
          width="42.167"
          height="42.167"
          rx="8.583"
          stroke={`url(#${gradViolet})`}
          strokeWidth="1.833"
        />
      </g>
      <rect
        className="brand-badge-frame"
        x="0.931"
        y="0.29"
        width="44.138"
        height="44.138"
        rx="9.569"
        stroke="currentColor"
        strokeOpacity="0.6"
        strokeWidth="0.138"
      />

      <g className="brand-mark-flat" fill="currentColor" fillRule="evenodd" clipRule="evenodd">
        <path d={MARK_FLAT} />
        <path d={MARK_FLAT_SOFT} opacity="0.4" />
      </g>
      <g className="brand-mark-badge" fill="white" fillRule="evenodd" clipRule="evenodd">
        <path d={MARK_BADGE} />
        <path d={MARK_BADGE_SOFT} opacity="0.4" />
      </g>

      <text
        className="brand-letters"
        x="54"
        y="29.6"
        fill="currentColor"
        fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
        fontSize="15.5"
        fontWeight="600"
        letterSpacing="-0.03em"
      >
        Workers Mail
      </text>
    </svg>
  );
}

/** The slash mark on its own — cropped to the glyph, follows `currentColor`. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="6.5 6 32 33"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path fillRule="evenodd" clipRule="evenodd" d={MARK_FLAT} />
      <path fillRule="evenodd" clipRule="evenodd" d={MARK_FLAT_SOFT} opacity="0.4" />
    </svg>
  );
}

const MARK_FLAT =
  "M18.4201 9.79148C19.2053 10.2448 19.4743 11.2487 19.021 12.0338L10.8134 26.2498C10.3601 27.0349 9.35616 27.3039 8.57104 26.8506C7.78592 26.3973 7.51689 25.3934 7.9702 24.6083L16.1778 10.3923C16.6311 9.6072 17.635 9.33819 18.4201 9.79148ZM27.7561 13.3178C28.5412 13.7712 28.8102 14.7751 28.3569 15.5602L18.5078 32.6194C18.0545 33.4045 17.0506 33.6735 16.2655 33.2202C15.4803 32.7669 15.2113 31.763 15.6646 30.9778L25.5137 13.9187C25.967 13.1336 26.9709 12.8645 27.7561 13.3178ZM36.7357 20.7434C37.2646 19.8275 37.0569 18.7174 36.2717 18.2641C35.4866 17.8108 34.4214 18.1859 33.8926 19.1019L24.317 35.6872C23.7882 36.6032 23.9959 37.7132 24.7811 38.1665C25.5662 38.6198 26.6314 38.2447 27.1602 37.3287L36.7357 20.7434Z";

const MARK_FLAT_SOFT =
  "M26.5658 8.82095C27.0191 8.03583 26.7501 7.03188 25.965 6.57859C25.1799 6.1253 24.1759 6.39431 23.7227 7.17943L8.949 32.7682C8.49569 33.5533 8.76471 34.5572 9.54983 35.0105C10.335 35.4638 11.3389 35.1948 11.7922 34.4097L26.5658 8.82095ZM30.3507 21.9604C30.8398 21.1134 30.5998 20.0592 29.8146 19.6059C29.0295 19.1526 27.9966 19.4718 27.5075 20.3189L22.1946 29.5211C21.7056 30.3681 21.9456 31.4222 22.7308 31.8755C23.5159 32.3288 24.5488 32.0097 25.0378 31.1626L30.3507 21.9604ZM36.4308 27.8462C37.216 28.2995 37.485 29.3034 37.0317 30.0885L35.3901 32.9317C34.9368 33.7169 33.9329 33.9859 33.1478 33.5326C32.3626 33.0792 32.0936 32.0753 32.547 31.2902L34.1885 28.447C34.6418 27.6619 35.6457 27.3929 36.4308 27.8462ZM11.5007 15.2139C11.9641 14.4113 11.7032 13.3932 10.9181 12.9399C10.133 12.4866 9.1209 12.7698 8.65749 13.5724L6.9794 16.479C6.516 17.2816 6.77684 18.2997 7.56196 18.753C8.34708 19.2063 9.35919 18.9231 9.8226 18.1205L11.5007 15.2139Z";

const MARK_BADGE =
  "M19.8676 11.3626C20.5546 11.7592 20.79 12.6377 20.3934 13.3247L13.2117 25.7636C12.8151 26.4506 11.9366 26.686 11.2497 26.2893C10.5627 25.8927 10.3273 25.0143 10.7239 24.3273L17.9056 11.8883C18.3022 11.2013 19.1806 10.966 19.8676 11.3626ZM28.0367 14.4486C28.7237 14.8453 28.9591 15.7237 28.5625 16.4107L19.9445 31.3374C19.5479 32.0244 18.6695 32.2598 17.9825 31.8632C17.2954 31.4665 17.0601 30.5881 17.4567 29.9011L26.0747 14.9744C26.4713 14.2874 27.3497 14.052 28.0367 14.4486ZM35.8938 20.9453C36.3565 20.1439 36.1747 19.1726 35.4877 18.776C34.8007 18.3793 33.8687 18.7075 33.406 19.509L25.0274 34.0211C24.5647 34.8226 24.7464 35.7939 25.4334 36.1905C26.1205 36.5871 27.0525 36.259 27.5152 35.4574L35.8938 20.9453Z";

const MARK_BADGE_SOFT =
  "M26.9951 10.5131C27.3917 9.82615 27.1564 8.94769 26.4694 8.55107C25.7824 8.15444 24.9039 8.38982 24.5073 9.0768L11.5804 31.4669C11.1837 32.1539 11.4191 33.0324 12.1061 33.429C12.7931 33.8256 13.6715 33.5903 14.0682 32.9033L26.9951 10.5131ZM30.3067 22.0107C30.7346 21.2696 30.5247 20.3472 29.8376 19.9506C29.1506 19.5539 28.2469 19.8333 27.819 20.5744L23.1702 28.6263C22.7422 29.3675 22.9523 30.2899 23.6393 30.6865C24.3263 31.0831 25.23 30.8038 25.658 30.0627L30.3067 22.0107ZM35.6267 27.1605C36.3137 27.5572 36.5491 28.4356 36.1524 29.1226L34.7161 31.6104C34.3195 32.2974 33.4411 32.5328 32.7541 32.1361C32.067 31.7395 31.8317 30.8611 32.2283 30.1741L33.6646 27.6863C34.0613 26.9993 34.9397 26.7639 35.6267 27.1605ZM13.8131 16.1074C14.2186 15.4051 13.9903 14.5143 13.3034 14.1177C12.6164 13.721 11.7308 13.9688 11.3253 14.6711L9.85698 17.2143C9.4515 17.9166 9.67973 18.8075 10.3667 19.2041C11.0537 19.6007 11.9393 19.353 12.3448 18.6506L13.8131 16.1074Z";
