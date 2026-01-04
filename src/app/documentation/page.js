"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "../../lib/documentation.module.css";

const acceptedTypes = ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf";

export default function Documentation() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const formatSize = (bytes) => {
    if (!Number.isFinite(bytes)) return "-";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${
      units[unitIndex]
    }`;
  };

  const getExtension = (doc) => {
    const filename = doc.title || doc.originalName || "";
    const match = filename.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "";
  };

  const getExtClass = (ext) => {
    if (ext === "pdf") return styles.extPdf;
    if (ext === "doc" || ext === "docx") return styles.extDoc;
    if (ext === "xls" || ext === "xlsx") return styles.extXls;
    if (ext === "ppt" || ext === "pptx") return styles.extPpt;
    return styles.extDefault;
  };
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const loadDocuments = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const res = await fetch("/api/documents", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Unable to load documents.");
      }

      setDocuments(data.documents ?? []);
    } catch (err) {
      setLoadError(err.message || "Unable to load documents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) {
      setUploadError("Choose a document before uploading.");
      return;
    }

    setUploading(true);
    setUploadError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Unable to upload document.");
      }

      setNotice("Document uploaded.");
      setFile(null);
      await loadDocuments();
    } catch (err) {
      setUploadError(err.message || "Unable to upload document.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (id) => {
    if (!id) return;
    window.location.href = `/api/documents/${id}`;
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <p className={styles.lead}>
          Upload Office files to store them in the database, then download them on demand.
        </p>
        <div className={styles.stack}>
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Upload a document</h2>
            <p className={styles.sectionLead}>
              Drag and drop or browse for a Word, Excel, PowerPoint, or PDF file.
            </p>
            <form className={styles.form} onSubmit={handleUpload}>
              <div
                className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept={acceptedTypes}
                  className={styles.fileInput}
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
                <div>
                  <p className={styles.dropTitle}>Drop your file here</p>
                  <p className={styles.dropHint}>or click to browse your computer</p>
                  {file && (
                    <p className={styles.fileName}>
                      Selected: <span>{file.name}</span>
                    </p>
                  )}
                </div>
              </div>
              <button
                type="submit"
                className={styles.button}
                disabled={uploading || !file}
              >
                {uploading ? "Uploading..." : "Upload document"}
              </button>
            </form>
            {notice && <p className={styles.notice}>{notice}</p>}
            {uploadError && <p className={styles.error}>{uploadError}</p>}
          </section>

          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Recent documents</h2>
            <p className={styles.sectionLead}>
              Browse the latest uploads and download instantly.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className={styles.tableEmpty}>
                        Loading documents...
                      </td>
                    </tr>
                  ) : documents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.tableEmpty}>
                        No documents uploaded yet.
                      </td>
                    </tr>
                  ) : (
                    documents.map((doc) => (
                      <tr key={doc._id}>
                        <td className={styles.tableName}>
                          <div className={styles.nameCell}>
                            <span>{doc.title || doc.originalName}</span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`${styles.extIcon} ${getExtClass(getExtension(doc))}`}
                          >
                            {getExtension(doc) || "file"}
                          </span>
                        </td>
                        <td>{formatSize(doc.size)}</td>
                        <td>
                          {doc.createdAt
                            ? new Date(doc.createdAt).toLocaleDateString()
                            : "-"}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.tableAction}
                            onClick={() => handleDownload(doc._id)}
                          >
                            Download
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className={styles.meta}>
              <span>{documents.length} document(s)</span>
              <Link href="/" className={styles.link}>
                Back to Home
              </Link>
            </div>
            {loadError && <p className={styles.error}>{loadError}</p>}
          </section>
        </div>
      </header>
    </div>
  );
}
