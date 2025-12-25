import Link from "next/link";
import styles from "../../lib/documentation.module.css";

export default function Documentation() {
  return (
    <div className={styles.container}>
      <header>
        <h1 className={styles.title}>Documentation</h1>
        <p className={styles.lead}>A small documentation page. Styles are provided by a CSS-only lib.</p>
        <div className={styles.card}>
          <p>
            This page demonstrates a documentation library that contains only CSS (no functions).
            Use this area to add guides, references, or embed styled examples.
          </p>
          <p className="mt-4">
            <Link href="/" className={styles.button}>
              Back to Home
            </Link>
          </p>
        </div>
      </header>
    </div>
  );
}
