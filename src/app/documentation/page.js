"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ParticleBackground from "../particle-background";
import styles from "../../lib/documentation.module.css";

const acceptedTypes = ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf";

export default function Documentation() {
  const searchParams = useSearchParams();
  const highlightedId = searchParams.get('highlight');
  const highlightRef = useRef(null);
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

  const getHierarchyLabel = (level) => {
    switch (level) {
      case 0:
        return "Admin Only";
      case 1:
        return "PR Managers";
      case 2:
        return "Same Role";
      case 3:
      default:
        return "Everyone";
    }
  };

  const getHierarchyColor = (level) => {
    switch (level) {
      case 0:
        return styles.levelAdmin;
      case 1:
        return styles.levelManager;
      case 2:
        return styles.levelRole;
      case 3:
      default:
        return styles.levelPublic;
    }
  };

  const canUploadToLevel = (level) => {
    const userRole = session?.user?.role?.toLowerCase() || "general";
    if (level === 0) return userRole === "admin";
    if (level === 1) return userRole === "admin" || userRole === "pr_manager";
    return true;
  };

  const getHierarchyBadge = (doc) => {
    if (doc.isPrivate) {
      return <span className={`${styles.badge} ${styles.badgePrivate}`}>🔒 Private</span>;
    }
    const level = doc.hierarchyLevel ?? 3;
    switch (level) {
      case 0:
        return <span className={`${styles.badge} ${styles.badgeAdmin}`}>🔐 Admin</span>;
      case 1:
        return <span className={`${styles.badge} ${styles.badgeManager}`}>👔 Managers</span>;
      case 2:
        const roles = doc.accessRoles && doc.accessRoles.length > 0 
          ? doc.accessRoles.join(", ") 
          : "Same Role";
        return (
          <span className={`${styles.badge} ${styles.badgeRole}`} title={roles}>
            👥 Role: {roles}
          </span>
        );
      case 3:
      default:
        return <span className={`${styles.badge} ${styles.badgePublic}`}>🌐 Public</span>;
    }
  };

  const getUserDepartments = () => {
    const departments = session?.user?.departments || [];
    const userRole = session?.user?.role?.toLowerCase() || "general";
    // Filter out admin role
    return departments.filter(dept => dept.toLowerCase() !== "admin");
  };

  const handleRoleToggle = (role) => {
    setSelectedRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const getSortedDocuments = (docs) => {
    // Get user's project IDs
    const userProjectIds = projects.map(p => p._id);
    
    // Sort: project files first (if user is in that project), then others
    return [...docs].sort((a, b) => {
      const aHasProject = a.projectId && userProjectIds.includes(a.projectId);
      const bHasProject = b.projectId && userProjectIds.includes(b.projectId);
      
      if (aHasProject && !bHasProject) return -1;
      if (!aHasProject && bHasProject) return 1;
      
      // Within same group, sort by date (newest first)
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  };

  const getProjectName = (projectId) => {
    const project = projects.find(p => p._id === projectId);
    return project?.title || "Unknown Project";
  };
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [session, setSession] = useState(null);
  const [hierarchyLevel, setHierarchyLevel] = useState(3);
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");

  const loadDocuments = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const res = await fetch("/api/documents", { cache: "no-store", credentials: "include" });
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
    // Load session to check user role
    const loadSession = async () => {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        setSession(data);
      } catch (err) {
        console.error("Failed to load session:", err);
      }
    };
    loadSession();

    // Load user's projects
    const loadProjects = async () => {
      try {
        const res = await fetch("/api/projects", { cache: "no-store" });
        const data = await res.json();
        if (res.ok) {
          // Filter to only projects user is assigned to
          const userProjects = (data.projects || []).filter(proj => {
            const assignments = proj.assignments || [];
            return assignments.some(a => a.userId);
          });
          setProjects(userProjects);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      }
    };
    loadProjects();
  }, []);

  // Scroll to highlighted document when documents load
  useEffect(() => {
    if (highlightedId && documents.length > 0 && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [highlightedId, documents]);

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
      formData.append("hierarchyLevel", hierarchyLevel.toString());
      formData.append("isPrivate", isPrivate.toString());
      if (selectedProject) {
        formData.append("projectId", selectedProject);
      }
      if (hierarchyLevel === 2 && selectedRoles.length > 0) {
        formData.append("accessRoles", selectedRoles.join(","));
      }

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Unable to upload document.");
      }

      setNotice("Document uploaded.");
      setFile(null);
      setHierarchyLevel(3);
      setIsPrivate(false);
      setSelectedRoles([]);
      setSelectedProject("");
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
      <ParticleBackground />
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

              <div className={styles.uploadOptions}>
                <div className={styles.optionGroup}>
                  <label htmlFor="hierarchyLevel" className={styles.label}>
                    Visibility Level:
                  </label>
                  <select
                    id="hierarchyLevel"
                    value={isPrivate ? 'private' : hierarchyLevel}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'private') {
                        setIsPrivate(true);
                        setHierarchyLevel(3);
                        setSelectedRoles([]);
                      } else {
                        setIsPrivate(false);
                        const newLevel = parseInt(value);
                        setHierarchyLevel(newLevel);
                        if (newLevel !== 2) {
                          setSelectedRoles([]);
                        }
                      }
                    }}
                    className={styles.select}
                  >
                    <option value="private">🔒 Private (Only visible to you)</option>
                    {canUploadToLevel(0) && <option value="0">Level 0 - Admin Only</option>}
                    {canUploadToLevel(1) && <option value="1">Level 1 - PR Managers</option>}
                    <option value="2">Level 2 - Same Role</option>
                    <option value="3">Level 3 - Everyone</option>
                  </select>
                </div>

                {!isPrivate && projects.length > 0 && (
                  <div className={styles.optionGroup}>
                    <label htmlFor="projectId" className={styles.label}>
                      Associate with Project (Optional):
                    </label>
                    <select
                      id="projectId"
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                      className={styles.select}
                    >
                      <option value="">No Project</option>
                      {projects.map((proj) => (
                        <option key={proj._id} value={proj._id}>
                          {proj.title}
                        </option>
                      ))}
                    </select>
                    <p className={styles.hint}>
                      Files linked to projects appear first for project members
                    </p>
                  </div>
                )}

                {!isPrivate && hierarchyLevel === 2 && (
                  <div className={styles.optionGroup}>
                    <label className={styles.label}>
                      Select Roles/Departments that can access:
                    </label>
                    <div className={styles.rolesGrid}>
                      {getUserDepartments().map((dept) => (
                        <label key={dept} className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={selectedRoles.includes(dept)}
                            onChange={() => handleRoleToggle(dept)}
                            className={styles.checkbox}
                          />
                          <span>{dept}</span>
                        </label>
                      ))}
                      {getUserDepartments().length === 0 && (
                        <p className={styles.noRoles}>No departments available</p>
                      )}
                    </div>
                  </div>
                )}
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
            <h2 className={styles.sectionTitle}>Shared Documents</h2>
            <p className={styles.sectionLead}>
              Browse all shared documents you have access to.
            </p>

            {loading && (
              <div className={styles.loadingState}>
                <p>Loading documents...</p>
              </div>
            )}

            {!loading && loadError && <p className={styles.error}>{loadError}</p>}

            {!loading && (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Access Level</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Uploaded By</th>
                        <th>Uploaded</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.filter(doc => !doc.isPrivate).length === 0 ? (
                        <tr>
                          <td colSpan={7} className={styles.tableEmpty}>
                            No shared documents available.
                          </td>
                        </tr>
                      ) : (
                        getSortedDocuments(documents.filter(doc => !doc.isPrivate))
                          .map((doc) => {
                          const isHighlighted = highlightedId === doc._id;
                          const userProjectIds = projects.map(p => p._id);
                          const isUserProject = doc.projectId && userProjectIds.includes(doc.projectId);
                          return (
                          <tr 
                            key={doc._id}
                            ref={isHighlighted ? highlightRef : null}
                            className={`${isHighlighted ? styles.highlightedRow : ''} ${isUserProject ? styles.projectRow : ''}`}
                          >
                            <td className={styles.tableName}>
                              <div className={styles.nameCell}>
                                <span>{doc.title || doc.originalName}</span>
                                {doc.projectId && isUserProject && (
                                  <span className={styles.projectBadge}>
                                    📁 {getProjectName(doc.projectId)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              {getHierarchyBadge(doc)}
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
                              {doc.uploadedByUsername && !doc.isPrivate ? (
                                <Link
                                  className={styles.link}
                                  href={`/profile/${encodeURIComponent(doc.uploadedByUsername)}`}
                                >
                                  {doc.uploadedByUsername}
                                </Link>
                              ) : doc.isPrivate ? (
                                "You"
                              ) : (
                                doc.uploadedByName || "-"
                              )}
                            </td>
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
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className={styles.meta}>
                  <span>{documents.filter(doc => !doc.isPrivate).length} shared document(s) accessible</span>
                </div>
              </>
            )}
          </section>

          {/* Private Documents Section */}
          {!loading && documents.filter(doc => doc.isPrivate).length > 0 && (
            <section className={`${styles.card} ${styles.privateCard}`}>
              <h2 className={styles.sectionTitle}>🔒 My Private Files</h2>
              <p className={styles.sectionLead}>
                Files visible only to you. Not shown on your profile.
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
                    {documents
                      .filter(doc => doc.isPrivate)
                      .map((doc) => {
                        const isHighlighted = highlightedId === doc._id;
                        return (
                        <tr 
                          key={doc._id}
                          ref={isHighlighted ? highlightRef : null}
                          className={isHighlighted ? styles.highlightedRow : ''}
                        >
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
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </header>
    </div>
  );
}
