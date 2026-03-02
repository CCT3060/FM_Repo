import React, { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function SubmissionsPage() {
    const [checklistSubmissions, setChecklistSubmissions] = useState([]);
    const [logsheetSubmissions, setLogsheetSubmissions] = useState([]);
    const [selectedTab, setSelectedTab] = useState('checklists');
    const [isLoading, setIsLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    const [submissionDetails, setSubmissionDetails] = useState(null);

    useEffect(() => {
        loadSubmissions();
    }, []);

    const loadSubmissions = async () => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('companyAuthToken');
            const headers = { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };

            const [checklistsRes, logsheetsRes] = await Promise.all([
                fetch(`${API_BASE}/api/template-assignments/submissions/checklists`, { headers }),
                fetch(`${API_BASE}/api/template-assignments/submissions/logsheets`, { headers }),
            ]);

            if (checklistsRes.ok && logsheetsRes.ok) {
                const checklistsData = await checklistsRes.json();
                const logsheetsData = await logsheetsRes.json();
                setChecklistSubmissions(checklistsData);
                setLogsheetSubmissions(logsheetsData);
            } else {
                throw new Error('Failed to load submissions');
            }
        } catch (error) {
            console.error('Failed to load submissions:', error);
            alert('Failed to load submissions');
        } finally {
            setIsLoading(false);
        }
    };

    const viewSubmissionDetails = async (type, id) => {
        try {
            const token = localStorage.getItem('companyAuthToken');
            const headers = { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            };

            const res = await fetch(
                `${API_BASE}/api/template-assignments/submissions/${type}/${id}`,
                { headers }
            );

            if (res.ok) {
                const data = await res.json();
                setSubmissionDetails(data);
                setSelectedSubmission({ type, id });
            } else {
                throw new Error('Failed to load submission details');
            }
        } catch (error) {
            console.error('Failed to load submission details:', error);
            alert('Failed to load submission details');
        }
    };

    const closeDetails = () => {
        setSelectedSubmission(null);
        setSubmissionDetails(null);
    };

    const submissions = selectedTab === 'checklists' ? checklistSubmissions : logsheetSubmissions;

    if (isLoading) {
        return (
            <div style={styles.container}>
                <div style={styles.loading}>
                    <p>Loading submissions...</p>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={styles.title}>Submissions & Reports</h1>
                <button onClick={loadSubmissions} style={styles.refreshButton}>
                    🔄 Refresh
                </button>
            </div>

            {/* Tabs */}
            <div style={styles.tabs}>
                <button
                    style={{
                        ...styles.tab,
                        ...(selectedTab === 'checklists' ? styles.tabActive : {}),
                    }}
                    onClick={() => setSelectedTab('checklists')}
                >
                    Checklist Submissions ({checklistSubmissions.length})
                </button>
                <button
                    style={{
                        ...styles.tab,
                        ...(selectedTab === 'logsheets' ? styles.tabActive : {}),
                    }}
                    onClick={() => setSelectedTab('logsheets')}
                >
                    Logsheet Entries ({logsheetSubmissions.length})
                </button>
            </div>

            {/* Submissions Table */}
            <div style={styles.tableContainer}>
                {submissions.length === 0 ? (
                    <div style={styles.emptyState}>
                        <p>No submissions found</p>
                    </div>
                ) : (
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>ID</th>
                                <th style={styles.th}>Template</th>
                                <th style={styles.th}>Submitted By</th>
                                <th style={styles.th}>Asset</th>
                                <th style={styles.th}>Submitted At</th>
                                <th style={styles.th}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {submissions.map((submission) => (
                                <tr key={submission.id} style={styles.tr}>
                                    <td style={styles.td}>{submission.id}</td>
                                    <td style={styles.td}>{submission.templateName}</td>
                                    <td style={styles.td}>{submission.submittedBy || 'Unknown'}</td>
                                    <td style={styles.td}>{submission.assetName || 'N/A'}</td>
                                    <td style={styles.td}>
                                        {new Date(submission.submittedAt).toLocaleString()}
                                    </td>
                                    <td style={styles.td}>
                                        <button
                                            style={styles.viewButton}
                                            onClick={() =>
                                                viewSubmissionDetails(selectedTab === 'checklists' ? 'checklists' : 'logsheets', submission.id)
                                            }
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Details Modal */}
            {selectedSubmission && submissionDetails && (
                <div style={styles.modalOverlay} onClick={closeDetails}>
                    <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.modalHeader}>
                            <h2 style={styles.modalTitle}>Submission Details</h2>
                            <button style={styles.closeButton} onClick={closeDetails}>
                                ✕
                            </button>
                        </div>

                        <div style={styles.modalContent}>
                            <div style={styles.infoRow}>
                                <strong>Template:</strong> {submissionDetails.templateName}
                            </div>
                            <div style={styles.infoRow}>
                                <strong>Submitted By:</strong> {submissionDetails.submittedBy || '—'}
                            </div>
                            <div style={styles.infoRow}>
                                <strong>Asset:</strong> {submissionDetails.assetName || 'N/A'}
                            </div>
                            <div style={styles.infoRow}>
                                <strong>Submitted At:</strong>{' '}
                                {new Date(submissionDetails.submittedAt).toLocaleString()}
                            </div>

                            <h3 style={styles.answersTitle}>Answers</h3>
                            <div style={styles.answersList}>
                                {submissionDetails.answers.map((answer, index) => (
                                    <div key={index} style={styles.answerCard}>
                                        <div style={styles.questionText}>
                                            Q{index + 1}: {answer.questionText}
                                        </div>
                                        <div style={styles.answerValue}>
                                            {answer.answerValue || 'No answer provided'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        padding: '20px',
        maxWidth: '1200px',
        margin: '0 auto',
    },
    loading: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '400px',
        fontSize: '18px',
        color: '#718096',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
    },
    title: {
        fontSize: '28px',
        fontWeight: '700',
        color: '#1A202C',
        margin: '0',
    },
    refreshButton: {
        padding: '10px 20px',
        backgroundColor: '#1E3A8A',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
    },
    tabs: {
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        borderBottom: '2px solid #E2E8F0',
    },
    tab: {
        padding: '12px 24px',
        backgroundColor: 'transparent',
        border: 'none',
        borderBottom: '3px solid transparent',
        fontSize: '15px',
        fontWeight: '600',
        color: '#718096',
        cursor: 'pointer',
        transition: 'all 0.3s',
    },
    tabActive: {
        color: '#1E3A8A',
        borderBottom: '3px solid #1E3A8A',
    },
    tableContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
    },
    emptyState: {
        padding: '60px',
        textAlign: 'center',
        color: '#718096',
        fontSize: '16px',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    th: {
        padding: '16px',
        textAlign: 'left',
        backgroundColor: '#F7FAFC',
        color: '#4A5568',
        fontSize: '14px',
        fontWeight: '700',
        borderBottom: '2px solid #E2E8F0',
    },
    tr: {
        borderBottom: '1px solid #E2E8F0',
    },
    td: {
        padding: '16px',
        fontSize: '14px',
        color: '#1A202C',
    },
    viewButton: {
        padding: '8px 16px',
        backgroundColor: '#EFF6FF',
        color: '#1E3A8A',
        border: 'none',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer',
    },
    modalOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    modal: {
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
    },
    modalHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px',
        borderBottom: '1px solid #E2E8F0',
    },
    modalTitle: {
        fontSize: '20px',
        fontWeight: '700',
        color: '#1A202C',
        margin: '0',
    },
    closeButton: {
        background: 'none',
        border: 'none',
        fontSize: '24px',
        color: '#718096',
        cursor: 'pointer',
        padding: '4px 8px',
    },
    modalContent: {
        padding: '20px',
    },
    infoRow: {
        marginBottom: '12px',
        fontSize: '15px',
        color: '#4A5568',
    },
    answersTitle: {
        fontSize: '18px',
        fontWeight: '700',
        color: '#1A202C',
        marginTop: '24px',
        marginBottom: '16px',
    },
    answersList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    answerCard: {
        backgroundColor: '#F7FAFC',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
    },
    questionText: {
        fontSize: '14px',
        fontWeight: '600',
        color: '#1A202C',
        marginBottom: '8px',
    },
    answerValue: {
        fontSize: '14px',
        color: '#4A5568',
    },
};
