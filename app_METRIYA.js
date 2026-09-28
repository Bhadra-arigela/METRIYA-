/* LMCC PREVIEW FIX v5 - syntax validated */
/*
 * ============================================================
 * METRIYA - LEGAL METROLOGY INSPECTION & COMPLIANCE SYSTEM
 * FRONTEND APPLICATION
 * ============================================================
 *
 * Handles:
 * - Page navigation
 * - Image upload
 * - Multiple image selection
 * - Backend communication
 * - OCR result rendering
 * - Declaration rendering
 * - Compliance rendering
 * - Report rendering
 * - History
 * - Dashboard
 * - Filters
 * - PDF / CSV export
 * - Mobile navigation
 *
 * Backend:
 * http://127.0.0.1:8000
 *
 * Endpoint:
 * POST /scan
 * ============================================================
 */

const LMCC_App = {

    /* ========================================================
       CONFIGURATION
       ======================================================== */

    // Use the same FastAPI server when opened normally, while still
    // supporting direct file opening during development.
    API_URL: window.location.protocol === "file:"
        ? "http://127.0.0.1:8000"
        : window.location.origin,

    handleLogin: async function (event) {

    event.preventDefault();

    const username =
        document.getElementById("login-email").value.trim();

    const password =
        document.getElementById("login-password").value;

    try {

        const response = await fetch(
            `${this.API_URL}/auth/login`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: username,
                    password: password
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.detail || "Login failed"
            );
        }

        this.showPage("page-3");

    } catch (error) {

        const errorBox =
            document.getElementById("login-error");

        if (errorBox) {
            errorBox.textContent =
                error.message;

            errorBox.classList.remove("hidden");
        }
    }
},

    selectedFiles: [],

    historyKey: "lmcc_scan_history",

    currentScanResult: null,

    currentPage: "page-1",

    previousPage: null,

    historyFilter: "all",

    /* Database-backed history cache */
    historyCache: [],

    analysisInProgress: false,

    analysisProgressTimer: null,

    previewObjectUrl: null,


    /* ========================================================
       INITIALIZATION
       ======================================================== */

    init: function () {

        this.setupNavigation();

        this.setupUpload();

        this.setupDragAndDrop();

        this.updateContinueButton();

        /* Load scan history from the backend database. */
        this.loadHistoryFromDatabase();

        this.updateHeader();

        this.refreshIcons();

    },
    downloadEvidence: function () {
    if (
        !Array.isArray(this.selectedFiles) ||
        !this.selectedFiles.length
    ) {
        alert("No evidence image available.");
        return;
    }

    const file = this.selectedFiles[0];
    const url = URL.createObjectURL(file);

    const link = document.createElement("a");
    link.href = url;
    link.download = file.name || "evidence-image.jpg";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
},


    /* ========================================================
       PAGE NAVIGATION
       ======================================================== */

    navigateTo: function (pageId) {

        if (!pageId) {
            return;
        }

        this.showPage(pageId);

    },


    showPage: function (pageId) {

        if (!pageId) {
            return;
        }


        const pages =
            document.querySelectorAll(
                ".page-view"
            );


        pages.forEach(
            page => {

                page.classList.add(
                    "hidden"
                );

            }
        );


        const target =
            document.getElementById(
                pageId
            );


        if (!target) {

            console.warn(
                "LMCC: Page not found:",
                pageId
            );

            return;

        }


        target.classList.remove(
            "hidden"
        );


        this.previousPage =
            this.currentPage;

        this.currentPage =
            pageId;


        /* Page-specific rendering */

        if (
            pageId === "page-6"
        ) {

            this.renderDeclarations(
                this.currentScanResult
            );

        }


        if (
            pageId === "page-7"
        ) {

            this.renderViolations(
                this.currentScanResult
            );

        }


        if (
            pageId === "page-8"
        ) {

            this.renderReadability(
                this.currentScanResult
            );

        }


        if (
            pageId === "page-9"
        ) {

            this.renderReport(
                this.currentScanResult
            );

        }


        if (
            pageId === "page-10"
        ) {

            this.renderHistory();

        }


        if (
            pageId === "page-11"
        ) {

            this.renderEnforcementDashboard();

        }


        if (
            pageId === "page-12"
        ) {

            this.renderViolationDetails();

        }


        if (
            pageId === "page-13"
        ) {

            this.applyFilters();

        }


        this.updateHeader();

        this.refreshIcons();


        try {

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });

        } catch (error) {

            window.scrollTo(
                0,
                0
            );

        }

    },


    goBack: function () {

        if (
            this.previousPage &&
            this.previousPage !==
                this.currentPage
        ) {

            const target =
                this.previousPage;

            this.previousPage =
                null;

            this.showPage(
                target
            );

            return;

        }


        if (
            this.currentPage !==
            "page-3"
        ) {

            this.showPage(
                "page-3"
            );

            return;

        }


        this.showPage(
            "page-1"
        );

    },


    /* ========================================================
       NAVIGATION SETUP
       ======================================================== */

    setupNavigation: function () {

        const backButton =
            document.getElementById(
                "btn-global-back"
            );


        if (backButton) {

            if (
                backButton.dataset
                    .lmccBackReady !==
                "true"
            ) {

                backButton.dataset
                    .lmccBackReady =
                    "true";


                backButton.addEventListener(
                    "click",
                    event => {

                        event.preventDefault();

                        this.goBack();

                    }
                );

            }

        }


        const drawerButton =
            document.getElementById(
                "btn-toggle-drawer"
            );


        const drawer =
            document.getElementById(
                "nav-drawer"
            );


        const backdrop =
            document.getElementById(
                "drawer-backdrop"
            );


        if (
            drawerButton &&
            drawer
        ) {

            if (
                drawerButton.dataset
                    .lmccDrawerReady !==
                "true"
            ) {

                drawerButton.dataset
                    .lmccDrawerReady =
                    "true";


                drawerButton.addEventListener(
                    "click",
                    event => {

                        event.preventDefault();

                        this.toggleDrawer();

                    }
                );

            }

        }


        if (backdrop) {

            if (
                backdrop.dataset
                    .lmccBackdropReady !==
                "true"
            ) {

                backdrop.dataset
                    .lmccBackdropReady =
                    "true";


                backdrop.addEventListener(
                    "click",
                    () => {

                        this.closeDrawer();

                    }
                );

            }

        }


        document
            .querySelectorAll(
                "[data-page]"
            )
            .forEach(
                button => {

                    if (
                        button.dataset
                            .lmccNavigationReady ===
                        "true"
                    ) {

                        return;

                    }


                    button.dataset
                        .lmccNavigationReady =
                        "true";


                    button.addEventListener(
                        "click",
                        event => {

                            event.preventDefault();


                            const page =
                                button.getAttribute(
                                    "data-page"
                                );


                            if (page) {

                                this.navigateTo(
                                    page
                                );

                            }


                            this.closeDrawer();

                        }
                    );

                }
            );

    },


    /* ========================================================
       DRAWER
       ======================================================== */

    toggleDrawer: function () {

        const drawer =
            document.getElementById(
                "nav-drawer"
            );


        const backdrop =
            document.getElementById(
                "drawer-backdrop"
            );


        if (!drawer) {

            return;

        }


        const isOpen =
            drawer.classList.contains(
                "translate-x-0"
            );


        if (isOpen) {

            this.closeDrawer();

        } else {

            drawer.classList.remove(
                "-translate-x-full"
            );

            drawer.classList.add(
                "translate-x-0"
            );


            if (backdrop) {

                backdrop.classList.remove(
                    "hidden"
                );

                backdrop.classList.remove(
                    "opacity-0"
                );

            }

        }

    },


    closeDrawer: function () {

        const drawer =
            document.getElementById(
                "nav-drawer"
            );


        const backdrop =
            document.getElementById(
                "drawer-backdrop"
            );


        if (drawer) {

            drawer.classList.remove(
                "translate-x-0"
            );

            drawer.classList.add(
                "-translate-x-full"
            );

        }


        if (backdrop) {

            backdrop.classList.add(
                "opacity-0"
            );

            backdrop.classList.add(
                "hidden"
            );

        }

    },


    /* ========================================================
       HEADER
       ======================================================== */

    updateHeader: function () {

        const header =
            document.getElementById(
                "main-header"
            );


        const backButton =
            document.getElementById(
                "btn-global-back"
            );


        const applicationPages = [

            "page-3",
            "page-4",
            "page-5",
            "page-6",
            "page-7",
            "page-8",
            "page-9",
            "page-10",
            "page-11",
            "page-12",
            "page-13",
            "page-14"

        ];


        if (
            header &&
            applicationPages.includes(
                this.currentPage
            )
        ) {

            header.classList.remove(
                "hidden"
            );

        } else if (header) {

            header.classList.add(
                "hidden"
            );

        }


        if (backButton) {

            if (
                applicationPages.includes(
                    this.currentPage
                )
            ) {

                backButton.classList.remove(
                    "hidden"
                );

                backButton.style.display =
                    "flex";

                backButton.setAttribute(
                    "aria-label",
                    "Go back"
                );

                backButton.title =
                    "Go back";

            } else {

                backButton.classList.add(
                    "hidden"
                );

                backButton.style.display =
                    "none";

            }

        }

    },


    /* ========================================================
       UPLOAD
       ======================================================== */

    setupUpload: function () {

        const fileInput =
            document.getElementById(
                "file-input"
            );


        const cameraInput =
            document.getElementById(
                "camera-input"
            );


        /*
         * The HTML already has
         * onchange="LMCC_App.handleFileSelect(event)"
         *
         * Therefore we intentionally DO NOT
         * add another change listener here.
         */

        if (fileInput) {

            fileInput.dataset
                .lmccUploadReady =
                "true";

        }


        if (cameraInput) {

            cameraInput.dataset
                .lmccUploadReady =
                "true";

        }

    },


    handleFileSelect: function (
        event
    ) {

        if (
            !event ||
            !event.target
        ) {

            return;

        }


        const files =
            event.target.files;


        if (
            !files ||
            !files.length
        ) {

            return;

        }


        this.selectedFiles = [];


        const maximumFiles =
            Math.min(
                files.length,
                5
            );


        for (
            let index = 0;
            index < maximumFiles;
            index++
        ) {

            const file =
                files[index];


            if (!file) {

                continue;

            }


            if (
                !file.type ||
                !file.type.startsWith(
                    "image/"
                )
            ) {

                continue;

            }


            if (
                file.size >
                10 * 1024 * 1024
            ) {

                this.showUploadError(
                    `${file.name} is larger than 10 MB.`
                );

                continue;

            }


            this.selectedFiles.push(
                file
            );

        }


        if (
            !this.selectedFiles.length
        ) {

            this.showUploadError(
                "Please select a valid product image."
            );

            this.updateContinueButton();

            return;

        }


        this.hideUploadError();

        this.displaySelectedFiles();

        this.updateContinueButton();

    },


    displaySelectedFiles: function () {

        if (
            !this.selectedFiles.length
        ) {

            return;

        }


        const firstFile =
            this.selectedFiles[0];


        const container =
            document.getElementById(
                "image-preview-container"
            );


        const previewImage =
            document.getElementById(
                "preview-img"
            );


        const filename =
            document.getElementById(
                "preview-filename"
            );


        const filesize =
            document.getElementById(
                "preview-filesize"
            );


        if (!container) {

            return;

        }


        if (
            this.previewObjectUrl
        ) {

            try {

                URL.revokeObjectURL(
                    this.previewObjectUrl
                );

            } catch (error) {}

        }


        this.previewObjectUrl =
            URL.createObjectURL(
                firstFile
            );


        if (previewImage) {

            previewImage.src =
                this.previewObjectUrl;

            previewImage.alt =
                firstFile.name ||
                "Product image";

            previewImage.classList.remove(
                "hidden"
            );

        }


        if (filename) {

            filename.textContent =
                firstFile.name ||
                "Selected image";

        }


        if (filesize) {

            filesize.textContent =
                this.formatFileSize(
                    firstFile.size
                );

        }


        container.classList.remove(
            "hidden"
        );


        const count =
            document.getElementById(
                "selected-image-count"
            );


        if (count) {

            if (
                this.selectedFiles.length >
                1
            ) {

                count.textContent =
                    `${this.selectedFiles.length} images selected`;

                count.classList.remove(
                    "hidden"
                );

            } else {

                count.textContent =
                    "";

                count.classList.add(
                    "hidden"
                );

            }

        }

    },


    removeSelectedFiles: function () {

        this.selectedFiles = [];


        if (
            this.previewObjectUrl
        ) {

            try {

                URL.revokeObjectURL(
                    this.previewObjectUrl
                );

            } catch (error) {}

            this.previewObjectUrl =
                null;

        }


        const container =
            document.getElementById(
                "image-preview-container"
            );


        if (container) {

            container.classList.add(
                "hidden"
            );

        }


        const fileInput =
            document.getElementById(
                "file-input"
            );


        const cameraInput =
            document.getElementById(
                "camera-input"
            );


        if (fileInput) {

            fileInput.value =
                "";

        }


        if (cameraInput) {

            cameraInput.value =
                "";

        }


        this.updateContinueButton();

    },


    updateContinueButton: function () {

        const button =
            document.getElementById(
                "btn-start-analysis"
            );


        if (!button) {

            return;

        }


        const enabled =
            Array.isArray(
                this.selectedFiles
            ) &&
            this.selectedFiles.length >
                0;


        button.disabled =
            !enabled;


        if (enabled) {

            button.classList.remove(
                "opacity-50",
                "cursor-not-allowed"
            );

        } else {

            button.classList.add(
                "opacity-50",
                "cursor-not-allowed"
            );

        }

    },


    showUploadError: function (
        message
    ) {

        const error =
            document.getElementById(
                "upload-error"
            );


        if (error) {

            error.textContent =
                message;

            error.classList.remove(
                "hidden"
            );

        } else {

            alert(
                message
            );

        }

    },


    hideUploadError: function () {

        const error =
            document.getElementById(
                "upload-error"
            );


        if (error) {

            error.classList.add(
                "hidden"
            );

        }

    },


    /* ========================================================
       DRAG AND DROP
       ======================================================== */

    setupDragAndDrop: function () {

        const dropZone =
            document.getElementById(
                "upload-dropzone"
            );


        if (!dropZone) {

            return;

        }


        if (
            dropZone.dataset
                .lmccDropReady ===
            "true"
        ) {

            return;

        }


        dropZone.dataset
            .lmccDropReady =
            "true";


        [
            "dragenter",
            "dragover"
        ].forEach(
            eventName => {

                dropZone.addEventListener(
                    eventName,
                    event => {

                        event.preventDefault();

                        event.stopPropagation();

                        dropZone.classList.add(
                            "ring-2",
                            "ring-sky-500"
                        );

                    }
                );

            }
        );


        [
            "dragleave",
            "drop"
        ].forEach(
            eventName => {

                dropZone.addEventListener(
                    eventName,
                    event => {

                        event.preventDefault();

                        event.stopPropagation();

                        dropZone.classList.remove(
                            "ring-2",
                            "ring-sky-500"
                        );

                    }
                );

            }
        );


        dropZone.addEventListener(
            "drop",
            event => {

                const files =
                    event.dataTransfer &&
                    event.dataTransfer.files;


                if (
                    !files ||
                    !files.length
                ) {

                    return;

                }


                const input =
                    document.getElementById(
                        "file-input"
                    );


                if (!input) {

                    return;

                }


                try {

                    const dataTransfer =
                        new DataTransfer();


                    for (
                        let index = 0;
                        index <
                        Math.min(
                            files.length,
                            5
                        );
                        index++
                    ) {

                        dataTransfer.items.add(
                            files[index]
                        );

                    }


                    input.files =
                        dataTransfer.files;


                    this.handleFileSelect({
                        target: input
                    });

                } catch (error) {

                    console.error(
                        "Drag/drop failed:",
                        error
                    );

                }

            }
        );

    },


    /* ========================================================
       ANALYSIS
       ======================================================== */

    startProductAnalysis:
        async function () {

            if (
                this.analysisInProgress
            ) {

                return;

            }


            if (
                !this.selectedFiles.length
            ) {

                alert(
                    "Please upload a product image first."
                );

                return;

            }


            this.analysisInProgress =
                true;


            this.navigateTo(
                "page-5"
            );


            this.showAnalysisLoading();


            try {

                const formData =
                    new FormData();


                const filesToSend =
                    this.selectedFiles.slice(
                        0,
                        5
                    );


                filesToSend.forEach(
                    (
                        file,
                        index
                    ) => {

                        formData.append(
                            `file${index + 1}`,
                            file,
                            file.name
                        );

                    }
                );


                this.updateAnalysisProgress(
                    10,
                    "Uploading Image...",
                    "Sending the product label to the analysis server."
                );


                const response =
                    await fetch(
                        `${this.API_URL}/scan`,
                        {
                            method: "POST",
                            body: formData
                        }
                    );


                if (
                    !response.ok
                ) {

                    let message =
                        `Server returned HTTP ${response.status}.`;


                    try {

                        const errorData =
                            await response.json();


                        if (
                            errorData &&
                            errorData.detail
                        ) {

                            message =
                                errorData.detail;

                        }

                    } catch (error) {}


                    throw new Error(
                        message
                    );

                }


                this.updateAnalysisProgress(
                    90,
                    "Finalizing Analysis...",
                    "Preparing the compliance result."
                );


                const result =
                    await response.json();


                console.log(
                    "METRIYA scan result:",
                    result
                );


                this.currentScanResult =
                    result;


                this.saveScanToHistory(
                    result
                );


                this.renderAnalysisResult(
                    result
                );


                this.renderDeclarations(
                    result
                );


                this.renderViolations(
                    result
                );


                this.renderReadability(
                    result
                );


                this.renderReport(
                    result
                );


                this.updateAnalysisProgress(
                    100,
                    "Analysis Complete",
                    "OCR, extraction and compliance checking completed."
                );


                this.stopAnalysisProgress();


                setTimeout(
                    () => {

                        this.showAnalysisResult();

                    },
                    250
                );


            } catch (error) {

                console.error(
                    "Product analysis failed:",
                    error
                );


                this.showAnalysisError(
                    error
                );


            } finally {

                this.stopAnalysisProgress();

                this.analysisInProgress =
                    false;

            }

        },


    showAnalysisLoading:
        function () {

            const loading =
                document.getElementById(
                    "analysis-loading-box"
                );


            const content =
                document.getElementById(
                    "analysis-result-content"
                );


            const error =
                document.getElementById(
                    "analysis-error"
                );


            if (loading) {

                loading.classList.remove(
                    "hidden"
                );

            }


            if (content) {

                content.classList.add(
                    "hidden"
                );

            }


            if (error) {

                error.classList.add(
                    "hidden"
                );

            }


            this.updateAnalysisProgress(
                5,
                "Preparing Image...",
                "Preparing the product image for OCR."
            );


            this.stopAnalysisProgress();


            /*
             * Smooth progress while backend is working.
             *
             * This is intentionally not a fake
             * instant 100%. It advances gradually
             * until the backend actually returns.
             */

            let progress =
                5;


            this.analysisProgressTimer =
                setInterval(
                    () => {

                        if (
                            !this.analysisInProgress
                        ) {

                            return;

                        }


                        if (
                            progress >=
                            85
                        ) {

                            return;

                        }


                        if (
                            progress <
                            25
                        ) {

                            progress +=
                                4;

                        } else if (
                            progress <
                            55
                        ) {

                            progress +=
                                2;

                        } else {

                            progress +=
                                1;

                        }


                        let title =
                            "Analyzing Product...";


                        let detail =
                            "Reading product label.";


                        if (
                            progress >=
                            20 &&
                            progress <
                            45
                        ) {

                            title =
                                "Running OCR...";

                            detail =
                                "Detecting text from the product package.";

                        }


                        if (
                            progress >=
                            45 &&
                            progress <
                            65
                        ) {

                            title =
                                "Extracting Fields...";

                            detail =
                                "Finding MRP, quantity, batch and dates.";

                        }


                        if (
                            progress >=
                            65
                        ) {

                            title =
                                "Checking Compliance...";

                            detail =
                                "Checking Legal Metrology declaration requirements.";

                        }


                        this.updateAnalysisProgress(
                            progress,
                            title,
                            detail
                        );

                    },
                    350
                );

        },


    updateAnalysisProgress:
        function (
            percent,
            title,
            detail
        ) {

            const bar =
                document.getElementById(
                    "analysis-progress-bar"
                );


            const titleElement =
                document.getElementById(
                    "analysis-step-title"
                );


            const detailElement =
                document.getElementById(
                    "analysis-step-detail"
                );


            let value =
                Number(percent);


            if (
                !Number.isFinite(
                    value
                )
            ) {

                value = 0;

            }


            value =
                Math.max(
                    0,
                    Math.min(
                        100,
                        value
                    )
                );


            if (bar) {

                bar.style.width =
                    `${value}%`;

                bar.setAttribute(
                    "aria-valuenow",
                    String(value)
                );

            }


            if (titleElement) {

                titleElement.textContent =
                    title ||
                    "Analyzing Product...";

            }


            if (detailElement) {

                detailElement.textContent =
                    detail ||
                    "";

            }

        },


    stopAnalysisProgress:
        function () {

            if (
                this.analysisProgressTimer
            ) {

                clearInterval(
                    this.analysisProgressTimer
                );

                this.analysisProgressTimer =
                    null;

            }

        },


    showAnalysisResult:
        function () {

            const loading =
                document.getElementById(
                    "analysis-loading-box"
                );


            const content =
                document.getElementById(
                    "analysis-result-content"
                );


            if (loading) {

                loading.classList.add(
                    "hidden"
                );

            }


            if (content) {

                content.classList.remove(
                    "hidden"
                );

            }


            this.refreshIcons();

        },


    showAnalysisError:
        function (
            error
        ) {

            this.stopAnalysisProgress();

            this.analysisInProgress =
                false;


            const loading =
                document.getElementById(
                    "analysis-loading-box"
                );


            const content =
                document.getElementById(
                    "analysis-result-content"
                );


            const errorBox =
                document.getElementById(
                    "analysis-error"
                );


            if (loading) {

                loading.classList.add(
                    "hidden"
                );

            }


            if (content) {

                content.classList.add(
                    "hidden"
                );

            }


            let message =
                "Unable to analyze the product.";


            if (
                error &&
                error.message
            ) {

                message =
                    error.message;

            } else if (
                typeof error ===
                "string"
            ) {

                message =
                    error;

            }


            if (errorBox) {

                errorBox.textContent =
                    message;

                errorBox.classList.remove(
                    "hidden"
                );

            } else {

                alert(
                    message
                );

            }

        },


    /* ========================================================
       BASIC HELPERS
       ======================================================== */

    getFields:
        function (
            result
        ) {

            if (!result) {

                return {};

            }


            if (
                result.fields &&
                typeof result.fields ===
                    "object"
            ) {

                return result.fields;

            }


            if (
                result.extracted_fields &&
                typeof result.extracted_fields ===
                    "object"
            ) {

                return result.extracted_fields;

            }


            return {};

        },


    getFieldValue:
        function (
            result,
            key
        ) {

            const fields =
                this.getFields(
                    result
                );


            if (
                !fields ||
                !Object.prototype.hasOwnProperty.call(
                    fields,
                    key
                )
            ) {

                return "";

            }


            const value =
                fields[key];


            if (
                value === null ||
                value === undefined
            ) {

                return "";

            }


            if (
                typeof value ===
                "object"
            ) {

                return (
                    value.value ??
                    value.text ??
                    value.raw ??
                    ""
                );

            }


            return String(
                value
            );

        },


    getFirstField:
        function (
            result,
            keys
        ) {

            if (
                !Array.isArray(
                    keys
                )
            ) {

                return "";

            }


            for (
                const key of keys
            ) {

                const value =
                    this.getFieldValue(
                        result,
                        key
                    );


                if (
                    value !== null &&
                    value !== undefined &&
                    String(value).trim()
                ) {

                    return value;

                }

            }


            return "";

        },


    escapeHtml:
        function (
            value
        ) {

            if (
                value === null ||
                value === undefined
            ) {

                return "";

            }


            return String(
                value
            )
                .replace(
                    /&/g,
                    "&amp;"
                )
                .replace(
                    /</g,
                    "&lt;"
                )
                .replace(
                    />/g,
                    "&gt;"
                )
                .replace(
                    /"/g,
                    "&quot;"
                )
                .replace(
                    /'/g,
                    "&#039;"
                );

        },


    formatFileSize:
        function (
            bytes
        ) {

            const value =
                Number(bytes);


            if (
                !Number.isFinite(
                    value
                )
            ) {

                return "—";

            }


            if (
                value <
                1024
            ) {

                return `${value} B`;

            }


            if (
                value <
                1024 * 1024
            ) {

                return `${(
                    value / 1024
                ).toFixed(1)} KB`;

            }


            return `${(
                value /
                (1024 * 1024)
            ).toFixed(1)} MB`;

        },


    formatDate:
        function (
            value
        ) {

            if (!value) {

                return "—";

            }


            const date =
                new Date(
                    value
                );


            if (
                !Number.isNaN(
                    date.getTime()
                )
            ) {

                return date.toLocaleString(
                    "en-IN"
                );

            }


            return String(
                value
            );

        },


    normalizeStatus:
        function (
            status
        ) {

            const normalized =
                String(
                    status ||
                    ""
                )
                    .trim()
                    .toUpperCase();


            if (
                normalized ===
                "PASS"
            ) {

                return "PASS";

            }


            if (
                normalized ===
                "FAIL"
            ) {

                return "FAIL";

            }


            if (
                normalized ===
                "REVIEW"
            ) {

                return "REVIEW_REQUIRED";

            }


            if (
                normalized ===
                "REVIEW_REQUIRED"
            ) {

                return "REVIEW_REQUIRED";

            }


            if (
                normalized ===
                "NOT_DETECTED"
            ) {

                return "NOT_DETECTED";

            }


            return (
                normalized ||
                "NOT_DETECTED"
            );

        },


    setText:
        function (
            id,
            value
        ) {

            const element =
                document.getElementById(
                    id
                );


            if (element) {

                element.textContent =
                    value === null ||
                    value === undefined
                        ? ""
                        : String(value);

            }

        },


    refreshIcons:
        function () {

            try {

                if (
                    window.lucide &&
                    typeof window.lucide
                        .createIcons ===
                    "function"
                ) {

                    window.lucide.createIcons();

                }

            } catch (error) {

                console.warn(
                    "Icon refresh skipped:",
                    error
                );

            }

        },    /* ========================================================
       UPLOAD
       ======================================================== */

    setupUpload: function () {

        const fileInput =
            document.getElementById(
                "file-input"
            );


        const cameraInput =
            document.getElementById(
                "camera-input"
            );


        /*
         * The HTML already contains:
         *
         * onchange="LMCC_App.handleFileSelect(event)"
         *
         * Therefore we DO NOT attach another
         * change listener here.
         */

        if (fileInput) {

            fileInput.dataset
                .lmccUploadReady =
                "true";

        }


        if (cameraInput) {

            cameraInput.dataset
                .lmccUploadReady =
                "true";

        }

    },


    handleFileSelect: function (
        event
    ) {

        if (
            !event ||
            !event.target
        ) {

            return;

        }


        const files =
            event.target.files;


        if (
            !files ||
            !files.length
        ) {

            return;

        }


        this.selectedFiles = [];


        const maximumFiles =
            Math.min(
                files.length,
                5
            );


        for (
            let index = 0;
            index < maximumFiles;
            index++
        ) {

            const file =
                files[index];


            if (!file) {

                continue;

            }


            if (
                !file.type ||
                !file.type.startsWith(
                    "image/"
                )
            ) {

                continue;

            }


            const fileName =
                String(
                    file.name ||
                    ""
                ).toLowerCase();


            const validExtension =
                fileName.endsWith(
                    ".jpg"
                ) ||
                fileName.endsWith(
                    ".jpeg"
                ) ||
                fileName.endsWith(
                    ".png"
                );


            const validMime =
                file.type ===
                    "image/jpeg" ||
                file.type ===
                    "image/png";


            if (
                !validExtension &&
                !validMime
            ) {

                this.showUploadError(
                    `${file.name} is not a JPG or PNG image.`
                );

                continue;

            }


            /*
             * Maximum 10 MB per image.
             */

            if (
                file.size >
                10 * 1024 * 1024
            ) {

                this.showUploadError(
                    `${file.name} is larger than 10 MB.`
                );

                continue;

            }


            this.selectedFiles.push(
                file
            );

        }


        if (
            this.selectedFiles.length >
            5
        ) {

            this.selectedFiles =
                this.selectedFiles.slice(
                    0,
                    5
                );

        }


        if (
            !this.selectedFiles.length
        ) {

            this.showUploadError(
                "Please select a valid JPG or PNG image under 10 MB."
            );

            this.updateContinueButton();

            return;

        }


        this.hideUploadError();

        // Reset so choosing the same file again still fires 'change'.
        try { event.target.value = ""; } catch (e) {}

        this.displaySelectedFiles();

        this.updateContinueButton();

    },


    displaySelectedFiles: function () {

        const files =
            this.selectedFiles;


        if (
            !Array.isArray(files) ||
            !files.length
        ) {

            return;

        }


        const container =
            document.getElementById(
                "image-preview-container"
            );


        const previewImage =
            document.getElementById(
                "preview-img"
            );


        const filename =
            document.getElementById(
                "preview-filename"
            );


        const filesize =
            document.getElementById(
                "preview-filesize"
            );


        if (!container) {

            return;

        }


        const firstFile =
            files[0];


        /*
         * Revoke previous preview URL.
         */

        if (
            this.previewObjectUrl
        ) {

            try {

                URL.revokeObjectURL(
                    this.previewObjectUrl
                );

            } catch (error) {}

        }


        this.previewObjectUrl =
            URL.createObjectURL(
                firstFile
            );


        if (previewImage) {

            previewImage.src =
                this.previewObjectUrl;

            previewImage.alt =
                firstFile.name ||
                "Product image";

            previewImage.classList.remove(
                "hidden"
            );

        }


        if (filename) {

            if (
                files.length ===
                1
            ) {

                filename.textContent =
                    firstFile.name;

            } else {

                filename.textContent =
                    `${firstFile.name} + ${
                        files.length - 1
                    } more image(s)`;

            }

        }


        if (filesize) {

            if (
                files.length ===
                1
            ) {

                filesize.textContent =
                    this.formatFileSize(
                        firstFile.size
                    );

            } else {

                const totalSize =
                    files.reduce(
                        (
                            total,
                            file
                        ) =>
                            total +
                            file.size,
                        0
                    );


                filesize.textContent =
                    `${files.length} images • ${
                        this.formatFileSize(
                            totalSize
                        )
                    } total`;

            }

        }


        container.classList.remove(
            "hidden"
        );


        /*
         * Optional multi-file list.
         */

        const selectedContainer =
            document.getElementById(
                "selected-files-container"
            );


        if (
            selectedContainer
        ) {

            selectedContainer.innerHTML =
                "";


            files.forEach(
                (
                    file,
                    index
                ) => {

                    const item =
                        document.createElement(
                            "div"
                        );


                    item.className =
                        "text-xs text-slate-600 flex items-center gap-2";


                    item.innerHTML =
                        `
                        <span class="font-semibold">
                            ${index + 1}.
                        </span>

                        <span class="truncate">
                            ${this.escapeHtml(
                                file.name
                            )}
                        </span>
                        `;


                    selectedContainer.appendChild(
                        item
                    );

                }
            );


            selectedContainer.classList.remove(
                "hidden"
            );

        }

    },


    clearUploadedImage:
        function () {

            this.selectedFiles = [];


            if (
                this.previewObjectUrl
            ) {

                try {

                    URL.revokeObjectURL(
                        this.previewObjectUrl
                    );

                } catch (error) {}

                this.previewObjectUrl =
                    null;

            }


            const fileInput =
                document.getElementById(
                    "file-input"
                );


            const cameraInput =
                document.getElementById(
                    "camera-input"
                );


            if (fileInput) {

                fileInput.value =
                    "";

            }


            if (cameraInput) {

                cameraInput.value =
                    "";

            }


            const container =
                document.getElementById(
                    "image-preview-container"
                );


            if (container) {

                container.classList.add(
                    "hidden"
                );

            }


            const image =
                document.getElementById(
                    "preview-img"
                );


            if (image) {

                image.removeAttribute(
                    "src"
                );

                image.alt =
                    "Uploaded product preview";

            }


            const filename =
                document.getElementById(
                    "preview-filename"
                );


            if (filename) {

                filename.textContent =
                    "No image selected";

            }


            const filesize =
                document.getElementById(
                    "preview-filesize"
                );


            if (filesize) {

                filesize.textContent =
                    "";

            }


            const selectedContainer =
                document.getElementById(
                    "selected-files-container"
                );


            if (
                selectedContainer
            ) {

                selectedContainer.innerHTML =
                    "";

                selectedContainer.classList.add(
                    "hidden"
                );

            }


            this.hideUploadError();

            this.updateContinueButton();

        },


    /*
     * Alias because some existing HTML buttons
     * may call removeSelectedFiles().
     */

    removeSelectedFiles:
        function () {

            this.clearUploadedImage();

        },


    updateContinueButton:
        function () {

            const button =
                document.getElementById(
                    "btn-start-analysis"
                );


            if (!button) {

                return;

            }


            const enabled =
                Array.isArray(
                    this.selectedFiles
                ) &&
                this.selectedFiles.length >
                    0;


            button.disabled =
                !enabled;


            if (enabled) {

                button.classList.remove(
                    "opacity-50",
                    "cursor-not-allowed"
                );

            } else {

                button.classList.add(
                    "opacity-50",
                    "cursor-not-allowed"
                );

            }

        },


    showUploadError:
        function (
            message
        ) {

            console.warn(
                "LMCC Upload:",
                message
            );


            const error =
                document.getElementById(
                    "upload-error"
                );


            const errorText =
                document.getElementById(
                    "upload-error-text"
                );


            if (errorText) {

                errorText.textContent =
                    message;

            }


            if (error) {

                error.classList.remove(
                    "hidden"
                );

                return;

            }


            alert(
                message
            );

        },


    hideUploadError:
        function () {

            const error =
                document.getElementById(
                    "upload-error"
                );


            if (error) {

                error.classList.add(
                    "hidden"
                );

            }

        },


    /* ========================================================
       DRAG AND DROP
       ======================================================== */

    setupDragAndDrop:
        function () {

            const dropZone =
                document.getElementById(
                    "upload-dropzone"
                );


            if (!dropZone) {

                return;

            }


            if (
                dropZone.dataset
                    .lmccDropReady ===
                "true"
            ) {

                return;

            }


            dropZone.dataset
                .lmccDropReady =
                "true";


            [
                "dragenter",
                "dragover"
            ].forEach(
                eventName => {

                    dropZone.addEventListener(
                        eventName,
                        event => {

                            event.preventDefault();

                            event.stopPropagation();

                            dropZone.classList.add(
                                "ring-2",
                                "ring-sky-500"
                            );

                        }
                    );

                }
            );


            [
                "dragleave",
                "drop"
            ].forEach(
                eventName => {

                    dropZone.addEventListener(
                        eventName,
                        event => {

                            event.preventDefault();

                            event.stopPropagation();

                            dropZone.classList.remove(
                                "ring-2",
                                "ring-sky-500"
                            );

                        }
                    );

                }
            );


            dropZone.addEventListener(
                "drop",
                event => {

                    const files =
                        event.dataTransfer &&
                        event.dataTransfer.files;


                    if (
                        !files ||
                        !files.length
                    ) {

                        return;

                    }


                    const input =
                        document.getElementById(
                            "file-input"
                        );


                    if (!input) {

                        return;

                    }


                    try {

                        const dataTransfer =
                            new DataTransfer();


                        for (
                            let index = 0;
                            index <
                            Math.min(
                                files.length,
                                5
                            );
                            index++
                        ) {

                            dataTransfer.items.add(
                                files[index]
                            );

                        }


                        input.files =
                            dataTransfer.files;


                        this.handleFileSelect({
                            target:
                                input
                        });

                    } catch (error) {

                        console.error(
                            "Drag/drop processing failed:",
                            error
                        );


                        this.showUploadError(
                            "Unable to process dropped files."
                        );

                    }

                }
            );

        },


    /* ========================================================
       UTILITY
       ======================================================== */

    getInputValue:
        function (
            id
        ) {

            const element =
                document.getElementById(
                    id
                );


            return element
                ? element.value
                : "";

        },


    getCheckboxValue:
        function (
            id
        ) {

            const element =
                document.getElementById(
                    id
                );


            return element
                ? Boolean(
                    element.checked
                )
                : false;

        },


    setInputValue:
        function (
            id,
            value
        ) {

            const element =
                document.getElementById(
                    id
                );


            if (element) {

                element.value =
                    value;

            }

        },


    setCheckboxValue:
        function (
            id,
            value
        ) {

            const element =
                document.getElementById(
                    id
                );


            if (element) {

                element.checked =
                    Boolean(
                        value
                    );

            }

        },    /* ========================================================
       PRODUCT ANALYSIS / BACKEND
       ======================================================== */

    startProductAnalysis:
    async function () {

        if (
            !Array.isArray(this.selectedFiles) ||
            !this.selectedFiles.length
        ) {

            alert(
                "Please upload or capture a product image first."
            );

            return;
        }


        if (this.analysisInProgress) {

            console.log(
                "Analysis already in progress."
            );

            return;
        }


        this.analysisInProgress =
            true;


        const files =
            this.selectedFiles.slice(
                0,
                5
            );


        this.navigateTo(
            "page-5"
        );

        this.showAnalysisLoading();


        const formData =
            new FormData();


        files.forEach(
            (
                file,
                index
            ) => {

                formData.append(
                    `file${index + 1}`,
                    file,
                    file.name
                );

            }
        );


        try {

            console.log(
                "Starting product analysis:",
                files.length,
                "image(s)"
            );


            this.setAnalysisProgress(
                12,
                "Preparing Image...",
                `Preparing ${
                    files.length
                } product image${
                    files.length > 1
                        ? "s"
                        : ""
                }.`
            );


            const response =
                await fetch(
                    `${this.API_URL}/scan`,
                    {
                        method:
                            "POST",

                        body:
                            formData
                    }
                );


            if (!response.ok) {

                let errorText =
                    `Backend returned HTTP ${
                        response.status
                    }`;


                try {

                    const errorData =
                        await response.json();


                    if (
                        errorData &&
                        errorData.detail
                    ) {

                        errorText =
                            typeof errorData.detail ===
                            "string"

                                ? errorData.detail

                                : JSON.stringify(
                                      errorData.detail
                                  );

                    }

                } catch (error) {

                    console.warn(
                        "Could not parse backend error."
                    );

                }


                throw new Error(
                    errorText
                );

            }


            this.setAnalysisProgress(
                82,
                "Reading OCR Result...",
                "RapidOCR finished. Processing detected declarations."
            );


            const result =
                await response.json();


            if (!result) {

                throw new Error(
                    "Backend returned an empty result."
                );

            }


            if (
                result.success ===
                false
            ) {

                throw new Error(
                    result.message ||
                    result.error ||
                    "Product analysis failed."
                );

            }


            this.setAnalysisProgress(
                91,
                "Extracting Fields...",
                "Checking MRP, quantity, batch, dates, manufacturer and other declarations."
            );


            this.currentScanResult =
                result;


            this.saveScanToHistory(
                result
            );


            this.renderAnalysisResult(
                result
            );

            this.renderDeclarations(
                result
            );

            this.renderViolations(
                result
            );

            this.renderReadability(
                result
            );

            this.renderReport(
                result
            );


            this.setAnalysisProgress(
                100,
                "Analysis Complete",
                "OCR, field extraction and compliance checks completed."
            );


            const loading =
                document.getElementById(
                    "analysis-loading-box"
                );


            if (loading) {

                loading.classList.add(
                    "hidden"
                );

            }


            const resultContent =
                document.getElementById(
                    "analysis-result-content"
                );


            if (resultContent) {

                resultContent.classList.remove(
                    "hidden"
                );

            }


            this.navigateTo(
                "page-5"
            );


            console.log(
                "Analysis completed successfully."
            );


        } catch (error) {

            console.error(
                "Product analysis failed:",
                error
            );


            this.showAnalysisError(
                error
            );


        } finally {

            this.stopAnalysisProgress();

            this.analysisInProgress =
                false;

        }

    },


    /* ========================================================
       ANALYSIS LOADING UI
       ======================================================== */

    showAnalysisLoading:
        function () {

            const loading =
                document.getElementById(
                    "analysis-loading-box"
                );


            const content =
                document.getElementById(
                    "analysis-result-content"
                );


            const error =
                document.getElementById(
                    "analysis-error"
                );


            if (loading) {

                loading.classList.remove(
                    "hidden"
                );

            }


            if (content) {

                content.classList.add(
                    "hidden"
                );

            }


            if (error) {

                error.classList.add(
                    "hidden"
                );

            }


            this.stopAnalysisProgress();


            this.setAnalysisProgress(
                5,
                "Preparing Image...",
                "Preparing the product label for fast OCR analysis."
            );


            /*
             * The backend request is a single HTTP request.
             * Therefore this is a visual progress indicator,
             * not a fake representation of exact backend timing.
             */

            this.analysisProgressTimer =
                setInterval(
                    () => {

                        const bar =
                            document.getElementById(
                                "analysis-progress-bar"
                            );


                        if (!bar) {

                            return;

                        }


                        const current =
                            parseInt(
                                bar.style.width,
                                10
                            ) || 5;


                        if (
                            current >= 80
                        ) {

                            return;

                        }


                        const next =
                            Math.min(
                                current + 2,
                                80
                            );


                        let title =
                            "Analyzing Product...";


                        let detail =
                            "Reading product label with RapidOCR.";


                        if (
                            next < 25
                        ) {

                            title =
                                "Preparing Image...";


                            detail =
                                "Optimizing the uploaded image.";

                        }

                        else if (
                            next < 55
                        ) {

                            title =
                                "Running OCR...";


                            detail =
                                "Reading printed text from the product label.";

                        }

                        else if (
                            next < 75
                        ) {

                            title =
                                "Extracting Declarations...";


                            detail =
                                "Finding MRP, quantity, dates, batch and manufacturer details.";

                        }

                        else {

                            title =
                                "Checking Compliance...";


                            detail =
                                "Applying Legal Metrology declaration checks.";

                        }


                        this.setAnalysisProgress(
                            next,
                            title,
                            detail
                        );

                    },
                    350
                );

        },


    setAnalysisProgress:
        function (
            percent,
            title,
            detail
        ) {

            const bar =
                document.getElementById(
                    "analysis-progress-bar"
                );


            const titleElement =
                document.getElementById(
                    "analysis-step-title"
                );


            const detailElement =
                document.getElementById(
                    "analysis-step-detail"
                );


            const safePercent =
                Math.max(
                    0,
                    Math.min(
                        100,
                        Number(percent) ||
                            0
                    )
                );


            if (bar) {

                bar.style.width =
                    `${safePercent}%`;

            }


            if (
                titleElement &&
                title
            ) {

                titleElement.textContent =
                    title;

            }


            if (
                detailElement &&
                detail
            ) {

                detailElement.textContent =
                    detail;

            }

        },


    stopAnalysisProgress:
        function () {

            if (
                this.analysisProgressTimer
            ) {

                clearInterval(
                    this.analysisProgressTimer
                );


                this.analysisProgressTimer =
                    null;

            }

        },


    showAnalysisError:
        function (
            error
        ) {

            this.stopAnalysisProgress();


            const loading =
                document.getElementById(
                    "analysis-loading-box"
                );


            const content =
                document.getElementById(
                    "analysis-result-content"
                );


            const errorBox =
                document.getElementById(
                    "analysis-error"
                );


            const errorText =
                document.getElementById(
                    "analysis-error-text"
                );


            if (loading) {

                loading.classList.add(
                    "hidden"
                );

            }


            if (content) {

                content.classList.add(
                    "hidden"
                );

            }


            const message =
                error &&
                error.message

                    ? error.message

                    : "Unable to analyze the product image.";


            if (errorText) {

                errorText.textContent =
                    message;

            }


            if (errorBox) {

                errorBox.classList.remove(
                    "hidden"
                );

            }


            console.error(
                "Analysis error:",
                message
            );

        },


    /* ========================================================
       BACKEND RESULT NORMALIZATION
       ======================================================== */

    getBackendData:
        function (
            result
        ) {

            if (
                !result ||
                typeof result !==
                    "object"
            ) {

                return {};

            }


            /*
             * Different backend versions may place
             * extracted fields in different locations.
             * Keep frontend tolerant without changing
             * the actual backend response.
             */

            if (
                result.data &&
                typeof result.data ===
                    "object"
            ) {

                return result.data;

            }


            if (
                result.result &&
                typeof result.result ===
                    "object"
            ) {

                return result.result;

            }


            return result;

        },


    getExtractedData:
        function (
            result
        ) {

            const data =
                this.getBackendData(
                    result
                );


            if (
                data.extracted_data &&
                typeof data.extracted_data ===
                    "object"
            ) {

                return data.extracted_data;

            }


            if (
                data.extracted &&
                typeof data.extracted ===
                    "object"
            ) {

                return data.extracted;

            }


            if (
                data.fields &&
                typeof data.fields ===
                    "object"
            ) {

                return data.fields;

            }


            return data;

        },


    getComplianceData:
        function (
            result
        ) {

            const data =
                this.getBackendData(
                    result
                );


            if (
                data.compliance &&
                typeof data.compliance ===
                    "object"
            ) {

                return data.compliance;

            }


            if (
                result &&
                result.compliance &&
                typeof result.compliance ===
                    "object"
            ) {

                return result.compliance;

            }


            return {};

        },


    getOCRText:
        function (
            result
        ) {

            if (
                !result ||
                typeof result !==
                    "object"
            ) {

                return "";

            }


            const data =
                this.getBackendData(
                    result
                );


            const candidates = [

                data.raw_text,

                data.ocr_text,

                data.full_text,

                data.text,

                result.raw_text,

                result.ocr_text

            ];


            for (
                const value
                of candidates
            ) {

                if (
                    typeof value ===
                        "string" &&
                    value.trim()
                ) {

                    return value.trim();

                }

            }


            /*
             * Some backend versions return
             * OCR lines as an array.
             */

            const arrayCandidates = [

                data.ocr_lines,

                data.text_lines,

                data.raw_ocr

            ];


            for (
                const value
                of arrayCandidates
            ) {

                if (
                    Array.isArray(value) &&
                    value.length
                ) {

                    return value
                        .map(
                            item => {

                                if (
                                    typeof item ===
                                        "string"
                                ) {

                                    return item;

                                }

                                if (
                                    item &&
                                    typeof item.text ===
                                        "string"
                                ) {

                                    return item.text;

                                }

                                return "";

                            }
                        )
                        .filter(Boolean)
                        .join("\n");

                }

            }


            return "";

        },


    getField:
        function (
            result,
            ...keys
        ) {

            const extracted =
                this.getExtractedData(
                    result
                );


            for (
                const key
                of keys
            ) {

                if (
                    extracted &&
                    Object.prototype
                        .hasOwnProperty.call(
                            extracted,
                            key
                        )
                ) {

                    const value =
                        extracted[key];


                    if (
                        value !==
                            null &&
                        value !==
                            undefined &&
                        String(value)
                            .trim()
                    ) {

                        return value;

                    }

                }

            }


            return "";

        },


    cleanDisplayValue:
    function (
        value
    ) {

        // Handle null / undefined directly
        if (
            value === null ||
            value === undefined
        ) {

            return "";

        }


        // Handle objects returned by backend
        if (
            typeof value === "object"
        ) {

            // Backend format:
            // { value: "...", status: "FOUND" }

            if (
                Object.prototype.hasOwnProperty.call(
                    value,
                    "value"
                )
            ) {

                if (
                    value.value === null ||
                    value.value === undefined
                ) {

                    return "";

                }

                return String(
                    value.value
                ).trim();

            }


            // Alternative backend format:
            // { text: "...", status: "FOUND" }

            if (
                Object.prototype.hasOwnProperty.call(
                    value,
                    "text"
                )
            ) {

                if (
                    value.text === null ||
                    value.text === undefined
                ) {

                    return "";

                }

                return String(
                    value.text
                ).trim();

            }


            try {

                return JSON.stringify(
                    value
                );

            } catch (
                error
            ) {

                return "";

            }

        }


        return String(
            value
        ).trim();

    },


    hasMeaningfulValue:
        function (
            value
        ) {

            const cleaned =
                this.cleanDisplayValue(
                    value
                );


            if (!cleaned) {

                return false;

            }


            const lower =
                cleaned.toLowerCase();


            return ![
                "not detected",
                "not found",
                "unknown",
                "n/a",
                "na",
                "null",
                "undefined",
                "-"
            ].includes(
                lower
            );

        },    /* ========================================================
       RESULT HELPERS
       ======================================================== */

    normalizeFieldLabel:
        function (
            label
        ) {

            const map = {

                product_name:
                    "Product Name",

                product:
                    "Product Name",

                name:
                    "Product Name",

                manufacturer:
                    "Manufacturer",

                manufacturer_name:
                    "Manufacturer",

                packer:
                    "Packer",

                importer:
                    "Importer",

                manufacturer_address:
                    "Manufacturer / Packer Address",

                address:
                    "Address",

                net_quantity:
                    "Net Quantity",

                quantity:
                    "Net Quantity",

                net_weight:
                    "Net Quantity",

                mrp:
                    "MRP",

                maximum_retail_price:
                    "MRP",

                batch:
                    "Batch / Lot Number",

                batch_no:
                    "Batch / Lot Number",

                batch_number:
                    "Batch / Lot Number",

                lot_no:
                    "Batch / Lot Number",

                mfd:
                    "Date of Manufacture / Packing",

                manufacturing_date:
                    "Date of Manufacture / Packing",

                packed_date:
                    "Date of Packing",

                pkd:
                    "Date of Packing",

                expiry:
                    "Expiry / Use By",

                expiry_date:
                    "Expiry / Use By",

                use_by:
                    "Expiry / Use By",

                best_before:
                    "Best Before",

                fssai:
                    "FSSAI License Number",

                fssai_license:
                    "FSSAI License Number",

                customer_care:
                    "Customer Care",

                customer_care_details:
                    "Customer Care",

                country_of_origin:
                    "Country of Origin"

            };


            const normalized =
                String(
                    label || ""
                )
                    .trim()
                    .toLowerCase()
                    .replace(
                        /\s+/g,
                        "_"
                    );


            return (
                map[normalized] ||
                String(
                    label || ""
                )
                    .replace(
                        /_/g,
                        " "
                    )
                    .replace(
                        /\b\w/g,
                        character =>
                            character.toUpperCase()
                    )
            );

        },


    formatFieldValue:
        function (
            key,
            value
        ) {

            const cleaned =
                this.cleanDisplayValue(
                    value
                );


            if (!cleaned) {

                return "Not Detected";

            }


            const normalizedKey =
                String(
                    key || ""
                )
                    .toLowerCase()
                    .replace(
                        /\s+/g,
                        "_"
                    );


            if (
                (
                    normalizedKey ===
                        "mrp" ||
                    normalizedKey ===
                        "maximum_retail_price"
                ) &&
                !cleaned
                    .toLowerCase()
                    .includes("rs")
            ) {

                const numeric =
                    cleaned.replace(
                        /[^0-9.]/g,
                        ""
                    );


                if (numeric) {

                    return `₹${numeric}`;

                }

            }


            return cleaned;

        },


    getStatusFromValue:
        function (
            value
        ) {

            if (
                !this.hasMeaningfulValue(
                    value
                )
            ) {

                return "NOT_DETECTED";

            }


            return "DETECTED";

        },


    getComplianceStatus:
        function (
            result
        ) {

            const compliance =
                this.getComplianceData(
                    result
                );


            const statusCandidates = [

                compliance.status,

                compliance.overall_status,

                compliance.result,

                result &&
                    result.status

            ];


            for (
                const value
                of statusCandidates
            ) {

                if (
                    value !==
                        null &&
                    value !==
                        undefined &&
                    String(value)
                        .trim()
                ) {

                    return String(
                        value
                    ).trim();

                }

            }


            const checks =
                compliance.checks;


            if (
                Array.isArray(checks)
            ) {

                const failures =
                    checks.filter(
                        item =>
                            String(
                                item &&
                                    (
                                        item.status ||
                                        item.result
                                    ) ||
                                    ""
                            )
                                .toUpperCase() ===
                            "FAIL"
                    );
                    const issueCount =
    failures.length;


                if (
                    failures.length
                ) {

                    return "NON-COMPLIANT";

                }

            }


            return "REVIEW REQUIRED";

        },


    getStatusClass:
        function (
            status
        ) {

            const normalized =
                String(
                    status || ""
                )
                    .toUpperCase()
                    .replace(
                        /[\s_-]+/g,
                        ""
                    );


            if (
                normalized ===
                    "PASS" ||
                normalized ===
                    "COMPLIANT" ||
                normalized ===
                    "COMPLIANTPASS"
            ) {

                return "pass";

            }


            if (
                normalized ===
                    "FAIL" ||
                normalized ===
                    "FAILED" ||
                normalized ===
                    "NONCOMPLIANT"
            ) {

                return "fail";

            }


            if (
                normalized ===
                    "NOTDETECTED"
            ) {

                return "not-detected";

            }


            return "review";

        },


    getStatusText:
        function (
            status
        ) {

            const normalized =
                String(
                    status || ""
                )
                    .toUpperCase()
                    .replace(
                        /[\s_-]+/g,
                        ""
                    );


            if (
                normalized ===
                    "PASS" ||
                normalized ===
                    "COMPLIANT"
            ) {

                return "PASS";

            }


            if (
                normalized ===
                    "FAIL" ||
                normalized ===
                    "FAILED" ||
                normalized ===
                    "NONCOMPLIANT"
            ) {

                return "FAIL";

            }


            if (
                normalized ===
                    "NOTDETECTED"
            ) {

                return "NOT DETECTED";

            }


            return "REVIEW REQUIRED";

        },


    /* ========================================================
       ANALYSIS RESULT PAGE
       ======================================================== */

    renderAnalysisResult:
        function (
            result
        ) {
                    const uploadedImage =
            document.getElementById(
                "result-uploaded-image"
            );

        if (
            uploadedImage &&
            Array.isArray(
                this.selectedFiles
            ) &&
            this.selectedFiles.length > 0
        ) {

            if (
                this.previewObjectUrl
            ) {
                URL.revokeObjectURL(
                    this.previewObjectUrl
                );
            }

            this.previewObjectUrl =
                URL.createObjectURL(
                    this.selectedFiles[0]
                );

            uploadedImage.src =
                this.previewObjectUrl;

        }

            const data =
                this.getBackendData(
                    result
                );


            const extracted =
                this.getExtractedData(
                    result
                );


            const compliance =
                this.getComplianceData(
                    result
                );


            const status =
                this.getComplianceStatus(
                    result
                );


            const statusText =
                this.getStatusText(
                    status
                );


            const statusClass =
                this.getStatusClass(
                    status
                );


            const productName =
                this.getField(
                    result,
                    "product_name",
                    "product",
                    "name"
                );


            const mrp =
                this.getField(
                    result,
                    "mrp",
                    "maximum_retail_price"
                );


            const quantity =
                this.getField(
                    result,
                    "net_quantity",
                    "quantity",
                    "net_weight"
                );


            const batch =
                this.getField(
                    result,
                    "batch",
                    "batch_no",
                    "batch_number",
                    "lot_no"
                );


            const manufacturer =
                this.getField(
                    result,
                    "manufacturer_or_marketer",
                    "manufacturer",
                    "manufacturer_name"
                );


            const fields = {

                productName:
                    productName,

                mrp:
                    mrp,

                quantity:
                    quantity,

                batch:
                    batch,

                manufacturer:
                    manufacturer

            };


            /*
             * Common IDs used by the current result page.
             * Missing elements are ignored so the app remains
             * compatible with the existing HTML.
             */

            const mappings = {                

                "result-product-title":
                    fields.productName,

                "result-product-name":
                    fields.productName,

                "analysis-product-name":
                    fields.productName,

                "result-mrp":
                    fields.mrp,

                "analysis-mrp":
                    fields.mrp,

                "result-quantity":
                    fields.quantity,

                "analysis-quantity":
                    fields.quantity,

                "result-batch":
                    fields.batch,

                "analysis-batch":
                    fields.batch,

                "result-manufacturer":
                    fields.manufacturer,

                "analysis-manufacturer":
                    fields.manufacturer

            };


            Object.entries(
                mappings
            ).forEach(
                (
                    [id, value]
                ) => {

                    const element =
                        document.getElementById(
                            id
                        );


                    if (!element) {

                        return;

                    }


                    element.textContent =
                        this.hasMeaningfulValue(
                            value
                        )
                            ? this.formatFieldValue(
                                  id,
                                  value
                              )
                            : "Not Detected";

                }
            );


            /*
             * Try to update a general compliance
             * status element if the HTML contains one.
             */

            const statusIds = [

                "result-compliance-status",

                "analysis-compliance-status",

                "compliance-status",

                "overall-status"

            ];


            statusIds.forEach(
                id => {

                    const element =
                        document.getElementById(
                            id
                        );


                    if (!element) {

                        return;

                    }


                    element.textContent =
                        statusText;


                    element.classList.remove(
                        "text-green-600",
                        "text-red-600",
                        "text-yellow-600",
                        "text-gray-600"
                    );


                    if (
                        statusClass ===
                        "pass"
                    ) {

                        element.classList.add(
                            "text-green-600"
                        );

                    }

                    else if (
                        statusClass ===
                        "fail"
                    ) {

                        element.classList.add(
                            "text-red-600"
                        );

                    }

                    else {

                        element.classList.add(
                            "text-yellow-600"
                        );

                    }

                }
            );


            /*
             * Store useful summary values for the
             * report/history sections.
             */

            this.currentScanSummary = {

                product_name:
                    this.cleanDisplayValue(
                        productName
                    ),

                mrp:
                    this.cleanDisplayValue(
                        mrp
                    ),

                net_quantity:
                    this.cleanDisplayValue(
                        quantity
                    ),

                batch:
                    this.cleanDisplayValue(
                        batch
                    ),

                manufacturer:
                    this.cleanDisplayValue(
                        manufacturer
                    ),

                compliance_status:
                    statusText,

                scanned_at:
                    new Date().toISOString(),

                number_of_images:
                    data.number_of_images ||
                    result.number_of_images ||
                    0

            };


            return this.currentScanSummary;

        },


    /* ========================================================
       DECLARATIONS PAGE
       ======================================================== */

    renderDeclarations:
        function (
            result
        ) {

            const extracted =
                this.getExtractedData(
                    result
                );


            const containerIds = [

                "declarations-grid",

                "declarations-list",

                "extracted-declarations",

                "declarations-container",

                "page-6-declarations"

            ];


            let container = null;


            for (
                const id
                of containerIds
            ) {

                const element =
                    document.getElementById(
                        id
                    );


                if (element) {

                    container =
                        element;

                    break;

                }

            }


            if (!container) {

                return;

            }


            container.innerHTML = "";


            const preferredOrder = [

                "product_name",

                "manufacturer",

                "manufacturer_address",

                "packer",

                "importer",

                "net_quantity",

                "mrp",

                "batch",

                "batch_no",

                "mfd",

                "manufacturing_date",

                "pkd",

                "packed_date",

                "expiry",

                "expiry_date",

                "use_by",

                "best_before",

                "fssai",

                "customer_care",

                "country_of_origin"

            ];


            const keys = [];


            preferredOrder.forEach(
                key => {

                    if (
                        Object.prototype
                            .hasOwnProperty.call(
                                extracted,
                                key
                            )
                    ) {

                        keys.push(
                            key
                        );

                    }

                }
            );


            Object.keys(
                extracted || {}
            ).forEach(
                key => {

                    if (
                        !keys.includes(
                            key
                        )
                    ) {

                        keys.push(
                            key
                        );

                    }

                }
            );


            if (!keys.length) {

                container.innerHTML =
                    `
                    <div class="p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
                        No structured declarations were returned by the backend.
                    </div>
                    `;

                return;

            }


            keys.forEach(
                key => {

                    const rawValue =
                        extracted[key];


                    const value =
                        this.cleanDisplayValue(
                            rawValue
                        );


                    const label =
                        this.normalizeFieldLabel(
                            key
                        );


                    const status =
                        this.getStatusFromValue(
                            rawValue
                        );


                    const row =
                        document.createElement(
                            "div"
                        );


                    row.className =
                        "flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-white mb-3";


                    const left =
                        document.createElement(
                            "div"
                        );


                    left.className =
                        "min-w-0";


                    const labelElement =
                        document.createElement(
                            "div"
                        );


                    labelElement.className =
                        "text-sm font-semibold text-slate-700";


                    labelElement.textContent =
                        label;


                    const valueElement =
                        document.createElement(
                            "div"
                        );


                    valueElement.className =
                        "mt-1 text-sm text-slate-900 break-words";


                    valueElement.textContent =
                        value ||
                        "Not Detected";


                    left.appendChild(
                        labelElement
                    );

                    left.appendChild(
                        valueElement
                    );


                    const badge =
                        document.createElement(
                            "span"
                        );


                    badge.className =
                        "shrink-0 px-3 py-1 rounded-full text-xs font-semibold";


                    if (
                        status ===
                        "DETECTED"
                    ) {

                        badge.classList.add(
                            "bg-green-100",
                            "text-green-700"
                        );

                        badge.textContent =
                            "Detected";

                    }

                    else {

                        badge.classList.add(
                            "bg-slate-100",
                            "text-slate-500"
                        );

                        badge.textContent =
                            "Not Detected";

                    }


                    row.appendChild(
                        left
                    );

                    row.appendChild(
                        badge
                    );


                    container.appendChild(
                        row
                    );

                }
            );

        },    
    /* ========================================================
       REPORT DATA
       ======================================================== */

    renderReport:
        function (
            result
        ) {

            if (!result) {

                return;

            }


            const compliance =
                this.getComplianceData(
                    result
                );


            const extracted =
                this.getExtractedData(
                    result
                );


            const status =
                this.getComplianceStatus(
                    result
                );


            const reportDate =
                new Date()
                    .toLocaleString();


            const values = {

                product:
                    this.getField(
                        result,
                        "product_name",
                        "product",
                        "name"
                    ),

                manufacturer:
                    this.getField(
                        result,
                        "manufacturer_or_marketer",
                        "manufacturer",
                        "manufacturer_name"
                    ),

                quantity:
                    this.getField(
                        result,
                        "net_quantity",
                        "quantity",
                        "net_weight"
                    ),

                mrp:
                    this.getField(
                        result,
                        "mrp",
                        "maximum_retail_price"
                    ),

                batch:
                    this.getField(
                        result,
                        "batch",
                        "batch_no",
                        "batch_number",
                        "lot_no"
                    ),

                mfd:
                    this.getField(
                        result,
                        "mfd",
                        "manufacturing_date",
                        "packed_date",
                        "pkd"
                    ),

                expiry:
                    this.getField(
                        result,
                        "expiry",
                        "expiry_date",
                        "use_by",
                        "best_before"
                    ),

                fssai:
                    this.getField(
                        result,
                        "fssai",
                        "fssai_license"
                    ),

                customerCare:
                    this.getField(
                        result,
                        "customer_care",
                        "customer_care_details"
                    )

            };


            const detection =
                Number(
                    compliance.detection_percentage ??
                    compliance.detection_percent ??
                    0
                );

                const issueCount =
    Array.isArray(compliance.rule_results)
        ? compliance.rule_results.filter(
            rule =>
                String(
                    rule.status || ""
                ).toUpperCase() === "FAIL"
        ).length
        : 0;


            const mappings = {

                "report-product-name":
                    values.product,

                "report-manufacturer":
                    values.manufacturer,

                "report-quantity":
                    values.quantity,

                "report-mrp":
                    values.mrp,

                "report-batch":
                    values.batch,

                "report-mfd":
                    values.mfd,

                "report-expiry":
                    values.expiry,

                "report-fssai":
                    values.fssai,

                "report-customer-care":
                    values.customerCare,

                "report-status":
                    this.getStatusText(
                        status
                    ),

                "report-detection":
                    `${Math.round(
                        Math.max(
                            0,
                            Math.min(
                                100,
                                detection
                            )
                        )
                    )}%`,

                "report-date":
    reportDate,

"report-score":
    `${Math.round(
        Math.max(
            0,
            Math.min(
                100,
                detection
            )
        )
    )}`,

"report-issue-count":
    issueCount

};


            Object.entries(
                mappings
            ).forEach(
                (
                    [id, value]
                ) => {

                    const element =
                        document.getElementById(
                            id
                        );


                    if (
                        element
                    ) {

                        element.textContent =
                            this.cleanDisplayValue(
                                value
                            ) ||
                            "Not Detected";

                    }

                }
            );
            const placement =
    compliance.placement ||
    result.placement ||
    {};

const placementBox =
    document.getElementById(
        "report-placement-verification"
    );

if (placementBox) {

    const detectedItems =
        Array.isArray(
            placement.detected_items
        )
            ? placement.detected_items
            : [];

    placementBox.innerHTML = `
        <div class="font-bold text-sm text-slate-800">
            Placement Verification
        </div>

        <div class="text-xs text-yellow-700 mt-2 font-semibold">
            Status: REVIEW REQUIRED
        </div>

        <div class="text-xs text-slate-600 mt-2">
            Detected text regions:
            <strong class="text-slate-800">
                ${detectedItems.length}
            </strong>
        </div>

        <div class="text-xs text-slate-500 mt-1">
            OCR bounding boxes detected. Physical placement
            requires visual verification.
        </div>
    `;
}
    const recommendations =
    document.getElementById(
        "report-recommendations"
    );

if (recommendations) {

    const rules =
        Array.isArray(
            compliance.rule_results
        )
            ? compliance.rule_results
            : [];

    const failures =
        rules.filter(
            rule =>
                String(
                    rule.status || ""
                ).toUpperCase() === "FAIL"
        );

    if (!failures.length) {

        recommendations.innerHTML = `
            <div class="p-3 rounded-xl border border-green-200 bg-green-50 text-green-800">
                No specific corrective recommendations.
            </div>
        `;

    } else {

        recommendations.innerHTML =
            failures.map(
                rule => `
                    <div class="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 flex items-center">
                        <span class="mr-2">💡</span>
                        ${this.escapeHtml(
                            rule.recommendation ||
                            rule.message ||
                            rule.reason ||
                            "Review this compliance requirement."
                        )}
                    </div>
                `
            ).join("");
    }
}
const evidenceImage =
    document.getElementById(
        "report-evidence-image"
    );

if (
    evidenceImage &&
    Array.isArray(this.selectedFiles) &&
    this.selectedFiles.length > 0
) {
    evidenceImage.src =
        URL.createObjectURL(
            this.selectedFiles[0]
        );
}

const addressVerification =
    document.getElementById("report-address-verification");

if (addressVerification) {

    const addressValue =
    this.getField(
        result,
        "manufacturer_address"
    );

const address =
    typeof addressValue === "object"
        ? String(
            addressValue.value ||
            addressValue.text ||
            addressValue.raw ||
            ""
        )
        : String(addressValue || "");
    console.log("REPORT ADDRESS:", address);

const pinMatch =
    address.match(
        /\b\d{3}\s?\d{3}\b/
    );

const pin =
    pinMatch
        ? pinMatch[0].replace(/\s/g, "")
        : "Not detected";

const cityMatch =
    address.match(
        /\b([A-Za-z]+)\s*[–-]\s*\d{3}\s?\d{3}\b/
    );

const city =
    cityMatch
        ? cityMatch[1]
        : "Not detected";

    addressVerification.innerHTML = `
        <div class="font-bold text-sm text-slate-800">
            Manufacturer Address Verification
        </div>

        <div class="text-xs text-slate-600 mt-2">
            City:
            <strong class="text-slate-800">
                ${this.escapeHtml(city)}
            </strong>
        </div>

        <div class="text-xs text-slate-600 mt-1">
            PIN Code:
            <strong class="text-slate-800">
                ${this.escapeHtml(pin)}
            </strong>
        </div>
    `;
}

            /*
             * Keep a complete report object in memory.
             * PDF and Excel generation later in this file
             * uses this object instead of reading the DOM.
             */

            this.currentReportData = {

                generated_at:
                    reportDate,

                product_name:
                    this.cleanDisplayValue(
                        values.product
                    ),

                manufacturer:
                    this.cleanDisplayValue(
                        values.manufacturer
                    ),

                net_quantity:
                    this.cleanDisplayValue(
                        values.quantity
                    ),

                mrp:
                    this.cleanDisplayValue(
                        values.mrp
                    ),

                batch:
                    this.cleanDisplayValue(
                        values.batch
                    ),

                manufacturing_date:
                    this.cleanDisplayValue(
                        values.mfd
                    ),

                expiry_date:
                    this.cleanDisplayValue(
                        values.expiry
                    ),

                fssai:
                    this.cleanDisplayValue(
                        values.fssai
                    ),

                customer_care:
                    this.cleanDisplayValue(
                        values.customerCare
                    ),

                compliance_status:
                    this.getStatusText(
                        status
                    ),

                detection_percentage:
                    detection,

                rule_results:
                    Array.isArray(
                        compliance.rule_results
                    )
                        ? compliance.rule_results
                        : [],

                extracted_data:
                    extracted

            };
                        
            return this.currentReportData;

        },


    /* ========================================================
       HISTORY
       ======================================================== */

    /* ========================================================
       DATABASE-BACKED HISTORY
       ======================================================== */

    normalizeHistoryRecord:
        function (row) {

            if (!row || typeof row !== "object") {
                return null;
            }

            /*
             * /history returns the SQLite row. Extracted declarations are
             * stored in row.fields (decoded from fields_json), not as
             * top-level mrp/net_quantity/manufacturer properties.
             */
            const fields =
                row.fields && typeof row.fields === "object"
                    ? row.fields
                    : {};

            const compliance =
                row.compliance && typeof row.compliance === "object"
                    ? row.compliance
                    : {};

            const value = (key, ...aliases) => {
                const keys = [key, ...aliases];
                for (const name of keys) {
                    if (Object.prototype.hasOwnProperty.call(fields, name)) {
                        const v = fields[name];
                        if (this.hasMeaningfulValue(v)) {
                            return v;
                        }
                    }
                }
                return "";
            };

            const status =
                this.getStatusText(
                    compliance.overall_status ||
                    row.status ||
                    "REVIEW_REQUIRED"
                );

            return {
                id: row.id,

                timestamp:
                    row.created_at ||
                    row.scan_date ||
                    row.timestamp ||
                    "",

                product_name: this.cleanDisplayValue(
                    value("product_name", "product", "name")
                ),
                productName: this.cleanDisplayValue(
                    value("product_name", "product", "name")
                ),
                mrp: this.cleanDisplayValue(value("mrp", "maximum_retail_price")),
                quantity: this.cleanDisplayValue(value("net_quantity", "quantity", "net_weight")),
                net_quantity: this.cleanDisplayValue(value("net_quantity", "quantity", "net_weight")),
                batch: this.cleanDisplayValue(value("batch", "batch_no", "batch_number", "lot_no")),
                manufacturer: this.cleanDisplayValue(value("manufacturer_or_marketer", "manufacturer", "manufacturer_name")),
                manufacturer_address: this.cleanDisplayValue(value("manufacturer_address", "address")),
                fssai: this.cleanDisplayValue(value("fssai", "fssai_license")),
                manufacturing_date: this.cleanDisplayValue(value("manufacturing_date", "mfd", "packed_date", "pkd")),
                expiry_date: this.cleanDisplayValue(value("expiry_date", "expiry", "use_by", "best_before")),
                customer_care: this.cleanDisplayValue(value("customer_care", "customer_care_details")),

                status: status,
                compliance_status:
                    compliance.overall_status || row.status || status,

                /* Preserve decoded database content for opening a history item. */
                database_row: row
            };
        },

    loadHistoryFromDatabase:
        async function () {

            try {

                const response =
                    await fetch(
                        `${this.API_URL}/history`,
                        {
                            method: "GET",
                            cache: "no-store"
                        }
                    );

                if (!response.ok) {

                    throw new Error(
                        `History request failed: HTTP ${response.status}`
                    );

                }

                const data =
                    await response.json();

                if (
                    !data ||
                    data.success === false
                ) {

                    throw new Error(
                        data?.message ||
                        "Unable to load scan history."
                    );

                }

                const rows =
                    Array.isArray(data.history)
                        ? data.history
                        : [];

                this.historyCache =
                    rows
                        .map(
                            row =>
                                this.normalizeHistoryRecord(
                                    row
                                )
                        )
                        .filter(Boolean);

                this.renderHistory();

                this.updateDashboardStats();

                return this.historyCache;

            } catch (error) {

                console.error(
                    "Database history load failed:",
                    error
                );

                /*
                 * Do not silently fall back to localStorage.
                 * The database is the source of truth.
                 */
                this.historyCache = [];

                this.renderHistory();

                this.updateDashboardStats();

                return [];

            }

        },


    /*
     * /scan already saves the scan to SQLite on the backend.
     * This function therefore only refreshes the database-backed
     * history after a successful scan.
     */
    saveScanToHistory:
        function () {

            this.loadHistoryFromDatabase();

        },


    getHistory:
        function () {

            return Array.isArray(
                this.historyCache
            )
                ? this.historyCache
                : [];

        },


    /*
     * Compatibility alias for dashboard/search code that
     * previously read localStorage.
     */
    loadStoredHistory:
        function () {

            return this.getHistory();

        },


    clearHistory:
        async function () {

            const confirmed =
                window.confirm(
                    "Clear all saved scan history?"
                );

            if (!confirmed) {
                return;
            }

            try {

                const response =
                    await fetch(
                        `${this.API_URL}/history`,
                        {
                            method: "DELETE"
                        }
                    );

                if (!response.ok) {

                    throw new Error(
                        `Clear history failed: HTTP ${response.status}`
                    );

                }

                const data =
                    await response.json();

                if (
                    data &&
                    data.success === false
                ) {

                    throw new Error(
                        data.message ||
                        "Unable to clear scan history."
                    );

                }

                this.historyCache = [];

                this.renderHistory();

                this.updateDashboardStats();

            } catch (error) {

                console.error(
                    "Could not clear database history:",
                    error
                );

                alert(
                    error.message ||
                    "Unable to clear scan history."
                );

            }

        },


    renderHistory:
        function () {

            this.refreshHistory();

        },


    refreshHistory:
        function () {

            const container =
                document.getElementById(
                    "history-products-list"
                ) ||
                document.getElementById(
                    "history-list"
                );


            if (!container) {

                return;

            }


            const history =
                this.getHistory();


            if (!history.length) {

                container.innerHTML =
                    `
                    <div class="p-6 text-center rounded-xl border border-slate-200 bg-slate-50">

                        <div class="text-sm font-semibold text-slate-600">
                            No scan history yet
                        </div>

                        <div class="text-xs text-slate-500 mt-1">
                            Completed product scans will appear here.
                        </div>

                    </div>
                    `;

                return;

            }


            const filtered =
                this.historyFilter ===
                    "all"

                    ? history

                    : history.filter(
                          item =>
                              String(
                                  item.status ||
                                  ""
                              )
                                  .toLowerCase()
                                  .replace(
                                      /[\s_-]+/g,
                                      ""
                                  ) ===
                              String(
                                  this.historyFilter
                              )
                                  .toLowerCase()
                                  .replace(
                                      /[\s_-]+/g,
                                      ""
                                  )
                      );


            if (!filtered.length) {

                container.innerHTML =
                    `
                    <div class="p-6 text-center rounded-xl border border-slate-200 bg-slate-50">

                        <div class="text-sm font-semibold text-slate-600">
                            No matching scans
                        </div>

                        <div class="text-xs text-slate-500 mt-1">
                            Try changing the history filter.
                        </div>

                    </div>
                    `;

                return;

            }


            container.innerHTML =
                filtered
                    .map(
                        item => {

                            const status =
                                this.getStatusText(
                                    item.status
                                );


                            const statusClass =
                                this.getStatusClass(
                                    item.status
                                );


                            let badge =
                                "bg-yellow-100 text-yellow-700";


                            if (
                                statusClass ===
                                "pass"
                            ) {

                                badge =
                                    "bg-green-100 text-green-700";

                            }

                            else if (
                                statusClass ===
                                "fail"
                            ) {

                                badge =
                                    "bg-red-100 text-red-700";

                            }


                            const date =
                                item.timestamp
                                    ? new Date(
                                          item.timestamp
                                      ).toLocaleString()
                                    : "Unknown date";


                            return `
                                <button
                                    type="button"
                                    class="w-full text-left p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition mb-3"
                                    onclick="LMCC_App.openHistoryRecord('${this.escapeAttribute(
                                        item.id
                                    )}')"
                                >

                                    <div class="flex items-start justify-between gap-3">

                                        <div class="min-w-0">

                                            <div class="font-semibold text-slate-800 truncate">
                                                ${this.escapeHtml(
                                                    item.product_name ||
                                                    "Scanned Product"
                                                )}
                                            </div>

                                            <div class="text-xs text-slate-500 mt-1">
                                                ${this.escapeHtml(
                                                    date
                                                )}
                                            </div>

                                        </div>

                                        <span class="shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${badge}">
                                            ${this.escapeHtml(
                                                status
                                            )}
                                        </span>

                                    </div>

                                    <div class="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600">

                                        <div>
                                            <span class="font-semibold">
                                                MRP:
                                            </span>
                                            ${this.escapeHtml(
                                                item.mrp ||
                                                "Not detected"
                                            )}
                                        </div>

                                        <div>
                                            <span class="font-semibold">
                                                Qty:
                                            </span>
                                            ${this.escapeHtml(
                                                item.quantity ||
                                                "Not detected"
                                            )}
                                        </div>

                                    </div>

                                </button>
                            `;

                        }
                    )
                    .join("");

        },


    openHistoryRecord:
        function (
            id
        ) {

            const history =
                this.getHistory();

            const record =
                history.find(
                    item =>
                        String(
                            item.id
                        ) ===
                        String(
                            id
                        )
                );

            if (!record) {
                return;
            }

            /*
             * Reconstruct the same shape as a live /scan response.
             * The database keeps declarations in row.fields and the full
             * compliance object in row.compliance.
             */
            const fields =
                row.fields && typeof row.fields === "object"
                    ? row.fields
                    : {};

            const field = (key, ...aliases) => {
                for (const name of [key, ...aliases]) {
                    if (Object.prototype.hasOwnProperty.call(fields, name)) {
                        return fields[name];
                    }
                }
                return { value: null, status: "NOT_FOUND" };
            };

            const compliance =
                row.compliance && typeof row.compliance === "object"
                    ? row.compliance
                    : { overall_status: row.status || "REVIEW_REQUIRED" };

            this.currentScanResult = {
                success: true,
                scan_id: row.id,
                number_of_images: row.number_of_images || 0,
                fields: {
                    product_name: field("product_name", "product", "name"),
                    mrp: field("mrp", "maximum_retail_price"),
                    net_quantity: field("net_quantity", "quantity", "net_weight"),
                    batch: field("batch", "batch_no", "batch_number", "lot_no"),
                    fssai: field("fssai", "fssai_license"),
                    manufacturing_date: field("manufacturing_date", "mfd", "packed_date", "pkd"),
                    expiry_date: field("expiry_date", "expiry", "use_by", "best_before"),
                    manufacturer_or_marketer: field("manufacturer_or_marketer", "manufacturer", "manufacturer_name"),
                    manufacturer_address: field("manufacturer_address", "address"),
                    customer_care: field("customer_care", "customer_care_details")
                },
                compliance: compliance,
                raw_text: row.raw_text || "",
                raw_ocr_text: row.raw_text || ""
            };


            this.renderAnalysisResult(
                this.currentScanResult
            );

            this.renderDeclarations(
                this.currentScanResult
            );

            this.renderViolations(
                this.currentScanResult
            );

            this.renderCompliance(
                this.currentScanResult
            );

            this.renderReadability(
                this.currentScanResult
            );

            this.renderReport(
                this.currentScanResult
            );

            this.navigateTo(
                "page-5"
            );

        },


    /* ========================================================
       SEARCH / FILTER
       ======================================================== */

    setHistoryFilter:
        function (
            filter
        ) {

            this.historyFilter =
                filter ||
                "all";


            this.refreshHistory();

        },


    searchHistory:
        function (
            query
        ) {

            const container =
                document.getElementById(
                    "history-products-list"
                ) ||
                document.getElementById(
                    "history-list"
                );


            if (!container) {

                return;

            }


            const search =
                String(
                    query ||
                    ""
                )
                    .trim()
                    .toLowerCase();


            const history =
                this.getHistory();


            const filtered =
                history.filter(
                    item => {

                        if (!search) {

                            return true;

                        }


                        const searchable = [

                            item.product_name,

                            item.manufacturer,

                            item.mrp,

                            item.quantity,

                            item.batch,

                            item.status,

                            item.timestamp

                        ]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase();


                        return searchable.includes(
                            search
                        );

                    }
                );


            if (!filtered.length) {

                container.innerHTML =
                    `
                    <div class="p-6 text-center rounded-xl border border-slate-200 bg-slate-50">

                        <div class="font-semibold text-slate-600">
                            No matching records
                        </div>

                        <div class="text-sm text-slate-500 mt-1">
                            No saved scan matches your search.
                        </div>

                    </div>
                    `;

                return;

            }


            /*
             * Temporarily render the matching
             * records using the same history UI.
             */

            container.innerHTML =
                filtered
                    .map(
                        item => {

                            const status =
                                this.getStatusText(
                                    item.status
                                );


                            const statusClass =
                                this.getStatusClass(
                                    item.status
                                );


                            let badgeClass =
                                "bg-yellow-100 text-yellow-700";


                            if (
                                statusClass ===
                                "pass"
                            ) {

                                badgeClass =
                                    "bg-green-100 text-green-700";

                            }

                            else if (
                                statusClass ===
                                "fail"
                            ) {

                                badgeClass =
                                    "bg-red-100 text-red-700";

                            }


                            return `
                                <button
                                    type="button"
                                    class="w-full text-left p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 mb-3"
                                    onclick="LMCC_App.openHistoryRecord('${this.escapeAttribute(
                                        item.id
                                    )}')"
                                >

                                    <div class="flex items-center justify-between gap-3">

                                        <div class="min-w-0">

                                            <div class="font-semibold text-slate-800 truncate">
                                                ${this.escapeHtml(
                                                    item.product_name ||
                                                    "Scanned Product"
                                                )}
                                            </div>

                                            <div class="text-xs text-slate-500 mt-1">
                                                ${this.escapeHtml(
                                                    item.manufacturer ||
                                                    "Manufacturer not detected"
                                                )}
                                            </div>

                                        </div>

                                        <span class="shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${badgeClass}">
                                            ${this.escapeHtml(
                                                status
                                            )}
                                        </span>

                                    </div>

                                    <div class="grid grid-cols-3 gap-2 mt-3 text-xs text-slate-600">

                                        <div>
                                            <span class="font-semibold">
                                                MRP:
                                            </span>
                                            ${this.escapeHtml(
                                                item.mrp ||
                                                "—"
                                            )}
                                        </div>

                                        <div>
                                            <span class="font-semibold">
                                                Qty:
                                            </span>
                                            ${this.escapeHtml(
                                                item.quantity ||
                                                "—"
                                            )}
                                        </div>

                                        <div>
                                            <span class="font-semibold">
                                                Batch:
                                            </span>
                                            ${this.escapeHtml(
                                                item.batch ||
                                                "—"
                                            )}
                                        </div>

                                    </div>

                                </button>
                            `;

                        }
                    )
                    .join("");

        },


    /* ========================================================
       SIMPLE SEARCH / FILTER PAGE
       ======================================================== */

    applySearchFilter:
        function () {

            const searchInput =
                document.getElementById(
                    "history-search"
                );


            const query =
                searchInput
                    ? searchInput.value
                    : "";


            this.searchHistory(
                query
            );

        },


    /* ========================================================
       DATABASE COMPATIBILITY
       ======================================================== */

    saveToDatabase:
        function (
            result
        ) {

            /*
             * If database.js provides a save method,
             * use it. Otherwise localStorage history
             * remains the fallback.
             */

            try {

                if (
                    window.LMCC_Database &&
                    typeof
                        window.LMCC_Database
                            .saveScan ===
                        "function"
                ) {

                    return window.LMCC_Database
                        .saveScan(
                            result
                        );

                }


                if (
                    window.Database &&
                    typeof
                        window.Database
                            .saveScan ===
                        "function"
                ) {

                    return window.Database
                        .saveScan(
                            result
                        );

                }

            } catch (error) {

                console.warn(
                    "Database save failed:",
                    error
                );

            }


            return null;

        },


    loadFromDatabase:
        function () {

            try {

                if (
                    window.LMCC_Database &&
                    typeof
                        window.LMCC_Database
                            .getScans ===
                        "function"
                ) {

                    return (
                        window.LMCC_Database
                            .getScans() ||
                        []
                    );

                }


                if (
                    window.Database &&
                    typeof
                        window.Database
                            .getScans ===
                        "function"
                ) {

                    return (
                        window.Database
                            .getScans() ||
                        []
                    );

                }

            } catch (error) {

                console.warn(
                    "Database read failed:",
                    error
                );

            }


            return [];

        },


    /* ========================================================
       HTML SAFETY
       ======================================================== */

    escapeHtml:
        function (
            value
        ) {

            const stringValue =
                String(
                    value ??
                    ""
                );


            return stringValue
                .replace(
                    /&/g,
                    "&amp;"
                )
                .replace(
                    /</g,
                    "&lt;"
                )
                .replace(
                    />/g,
                    "&gt;"
                )
                .replace(
                    /"/g,
                    "&quot;"
                )
                .replace(
                    /'/g,
                    "&#039;"
                );

        },


    escapeAttribute:
        function (
            value
        ) {

            return this.escapeHtml(
                value
            )
                .replace(
                    /`/g,
                    "&#096;"
                );

        },


    /* ========================================================
       FIELD COMPATIBILITY HELPERS
       ======================================================== */

    getFieldValue:
        function (
            result,
            fieldName
        ) {

            if (
                !result ||
                !fieldName
            ) {

                return "";

            }


            const fields =
                result.fields ||
                (
                    result.data &&
                    result.data.fields
                ) ||
                {};


            const extracted =
                result.extracted_data ||
                result.extracted ||
                (
                    result.data &&
                    (
                        result.data.extracted_data ||
                        result.data.extracted
                    )
                ) ||
                {};


            let value =
                fields[fieldName];


            if (
                value ===
                    undefined
            ) {

                value =
                    extracted[fieldName];

            }


            if (
                value ===
                    undefined &&
                result[fieldName] !==
                    undefined
            ) {

                value =
                    result[fieldName];

            }


            if (
                value &&
                typeof value ===
                    "object"
            ) {

                value =
                    value.value ??
                    value.text ??
                    "";

            }


            return this.cleanDisplayValue(
                value
            );

        },


    getFieldStatus:
        function (
            result,
            fieldName
        ) {

            if (
                !result ||
                !fieldName
            ) {

                return "NOT_FOUND";

            }


            const fields =
                result.fields ||
                {};


            const field =
                fields[fieldName];


            if (
                field &&
                typeof field ===
                    "object"
            ) {

                return String(
                    field.status ||
                    (
                        field.value
                            ? "FOUND"
                            : "NOT_FOUND"
                    )
                ).toUpperCase();

            }


            return field
                ? "FOUND"
                : "NOT_FOUND";

        },


    setText:
        function (
            id,
            value
        ) {

            const element =
                document.getElementById(
                    id
                );


            if (
                element
            ) {

                element.textContent =
                    value ??
                    "";

            }

        },


    updateHistoryTabStyles:
        function () {

            const buttons =
                document.querySelectorAll(
                    "[data-history-filter]"
                );


            buttons.forEach(
                button => {

                    const filter =
                        String(
                            button.dataset
                                .historyFilter ||
                            "all"
                        ).toLowerCase();


                    const active =
                        filter ===
                        String(
                            this.historyFilter ||
                            "all"
                        ).toLowerCase();


                    button.classList.toggle(
                        "bg-blue-600",
                        active
                    );


                    button.classList.toggle(
                        "text-white",
                        active
                    );


                    button.classList.toggle(
                        "bg-gray-100",
                        !active
                    );


                    button.classList.toggle(
                        "text-gray-700",
                        !active
                    );

                }
            );

        },


    setHistoryFilter:
        function (
            filter
        ) {

            this.historyFilter =
                filter ||
                "all";


            this.renderHistory();

        },


    /* ========================================================
       DASHBOARD
       ======================================================== */

    updateDashboardStats:
        function () {

            const history =
                this.loadStoredHistory();


            const total =
                history.length;


            const compliant =
                history.filter(
                    item =>
                        String(
                            item.status ||
                            ""
                        ).toUpperCase() ===
                        "COMPLIANT"
                ).length;


            const nonCompliant =
                history.filter(
                    item =>
                        String(
                            item.status ||
                            ""
                        ).toUpperCase() ===
                        "NON_COMPLIANT"
                ).length;


            const review =
                history.filter(
                    item =>
                        String(
                            item.status ||
                            ""
                        ).toUpperCase() ===
                        "REVIEW_REQUIRED"
                ).length;


            const mappings = {

                "dashboard-total-scans":
                    total,

                "dashboard-compliant":
                    compliant,

                "dashboard-non-compliant":
                    nonCompliant,

                "dashboard-review":
                    review,

                "total-scans":
                    total,

                "compliant-count":
                    compliant,

                "non-compliant-count":
                    nonCompliant,

                "review-count":
                    review

            };


            Object.entries(
                mappings
            ).forEach(
                (
                    [id, value]
                ) => {

                    const element =
                        document.getElementById(
                            id
                        );


                    if (
                        element
                    ) {

                        element.textContent =
                            String(
                                value
                            );

                    }

                }
            );


            /*
             * Recent scans on dashboard.
             */

            const recentContainer =
                document.getElementById(
                    "dashboard-recent-scans"
                );


            if (
                !recentContainer
            ) {

                return;

            }


            const recent =
                history.slice(
                    0,
                    5
                );


            if (!recent.length) {

                recentContainer.innerHTML =
                    `
                    <div class="text-sm text-gray-500">
                        No recent scans.
                    </div>
                    `;

                return;

            }


            recentContainer.innerHTML =
                recent
                    .map(
                        item => {

                            const status =
                                String(
                                    item.status ||
                                    "REVIEW_REQUIRED"
                                ).toUpperCase();


                            return `
                                <div class="flex items-center justify-between gap-3 py-3 border-b border-gray-100 last:border-0">

                                    <div class="min-w-0">

                                        <div class="font-medium text-gray-800 truncate">
                                            ${this.escapeHtml(
                                                item.productName ||
                                                "Unknown Product"
                                            )}
                                        </div>

                                        <div class="text-xs text-gray-400">
                                            ${this.escapeHtml(
                                                this.formatDate(
                                                    item.timestamp
                                                )
                                            )}
                                        </div>

                                    </div>

                                    <span class="text-xs font-semibold">
                                        ${this.escapeHtml(
                                            status
                                        )}
                                    </span>

                                </div>
                            `;

                        }
                    )
                    .join("");

        },


    /* ========================================================
       ENFORCEMENT DASHBOARD
       ======================================================== */

    renderEnforcementDashboard:
        function () {

            const history =
                this.loadStoredHistory();


            const total =
                history.length;


            const violations =
                history.filter(
                    item =>
                        String(
                            item.status ||
                            ""
                        ).toUpperCase() ===
                        "NON_COMPLIANT"
                ).length;


            const review =
                history.filter(
                    item =>
                        String(
                            item.status ||
                            ""
                        ).toUpperCase() ===
                        "REVIEW_REQUIRED"
                ).length;


            const compliance =
                history.filter(
                    item =>
                        String(
                            item.status ||
                            ""
                        ).toUpperCase() ===
                        "COMPLIANT"
                ).length;


            const values = {

                "enforcement-total":
                    total,

                "enforcement-violations":
                    violations,

                "enforcement-review":
                    review,

                "enforcement-compliant":
                    compliance

            };


            Object.entries(
                values
            ).forEach(
                (
                    [id, value]
                ) => {

                    const element =
                        document.getElementById(
                            id
                        );


                    if (
                        element
                    ) {

                        element.textContent =
                            String(
                                value
                            );

                    }

                }
            );


            const container =
                document.getElementById(
                    "enforcement-violations-list"
                );


            if (
                !container
            ) {

                return;

            }


            const violationRecords =
                history.filter(
                    item =>
                        String(
                            item.status ||
                            ""
                        ).toUpperCase() ===
                        "NON_COMPLIANT"
                );


            if (
                !violationRecords.length
            ) {

                container.innerHTML =
                    `
                    <div class="p-5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500">
                        No confirmed non-compliant scan records.
                    </div>
                    `;

                return;

            }


            container.innerHTML =
                violationRecords
                    .slice(
                        0,
                        20
                    )
                    .map(
                        item => {

                            return `
                                <div class="p-4 rounded-xl border border-red-200 bg-red-50 mb-3">

                                    <div class="font-semibold text-red-800">
                                        ${this.escapeHtml(
                                            item.productName ||
                                            "Unknown Product"
                                        )}
                                    </div>

                                    <div class="text-sm text-red-700 mt-1">
                                        ${this.escapeHtml(
                                            item.manufacturer ||
                                            "Manufacturer not detected"
                                        )}
                                    </div>

                                    <div class="text-xs text-red-600 mt-2">
                                        Confirmed violations:
                                        ${Number(
                                            item.confirmedViolations ||
                                            0
                                        )}
                                    </div>

                                </div>
                            `;

                        }
                    )
                    .join("");

        },


    /* ========================================================
       DATE / NUMBER UTILITIES
       ======================================================== */

    formatDate:
        function (
            value
        ) {

            if (!value) {

                return "Unknown date";

            }


            const date =
                new Date(
                    value
                );


            if (
                Number.isNaN(
                    date.getTime()
                )
            ) {

                return String(
                    value
                );

            }


            return date.toLocaleString(
                undefined,
                {
                    day:
                        "2-digit",

                    month:
                        "short",

                    year:
                        "numeric",

                    hour:
                        "2-digit",

                    minute:
                        "2-digit"

                }
            );

        },


    formatNumber:
        function (
            value
        ) {

            const number =
                Number(
                    value
                );


            if (
                !Number.isFinite(
                    number
                )
            ) {

                return "0";

            }


            return number.toLocaleString();

        },


    /* ========================================================
       SCAN RESET
       ======================================================== */

    resetCurrentScan:
        function () {

            this.currentScanResult =
                null;


            this.currentReportData =
                null;


            this.selectedFiles =
                [];


            this.analysisInProgress =
                false;


            this.stopAnalysisProgress();


            if (
                this.previewObjectUrl
            ) {

                try {

                    URL.revokeObjectURL(
                        this.previewObjectUrl
                    );

                } catch (
                    error
                ) {}

                this.previewObjectUrl =
                    null;

            }


            const fileInput =
                document.getElementById(
                    "file-input"
                );


            if (
                fileInput
            ) {

                fileInput.value =
                    "";

            }


            const preview =
                document.getElementById(
                    "preview-img"
                );


            if (
                preview
            ) {

                preview.src =
                    "";

                preview.classList.add(
                    "hidden"
                );

            }


            this.displaySelectedFiles();

            this.updateContinueButton();

        },


    /* Fallbacks: called by the scan flow but were missing from this file. */
    renderViolations: function (result) {},
renderReadability: function (result) {

    result =
        result ||
        this.currentScanResult;

    if (!result) {
        return;
    }

    const fields =
        result.fields ||
        result.extracted_fields ||
        {};

    const readability =
        result.compliance?.readability ||
        result.readability ||
        {};

    const status =
        String(
            readability.status ||
            "REVIEW_REQUIRED"
        ).toUpperCase();

    const message =
        readability.message ||
        "Readability and font size require visual verification from the product image.";

    const mrp =
        typeof fields.mrp === "object"
            ? fields.mrp.value
            : fields.mrp;

    const statusElement =
        document.getElementById(
            "report-readability-status"
        );

    const messageElement =
        document.getElementById(
            "readability-message"
        );

    const mrpElement =
        document.getElementById(
            "readability-mrp"
        );

    if (statusElement) {
        statusElement.textContent =
            status;
    }

    if (messageElement) {
        messageElement.textContent =
            message;
    }

    if (mrpElement) {
        mrpElement.textContent =
            `M.R.P. ${mrp}`;
    }

},
    renderCompliance: function (result) {},
    startNewScan:
        function () {

            this.resetCurrentScan();


            this.navigateTo(
                "page-4"
            );

        },
    showViolationDetails:
        function (
            result
        ) {

            result =
                result ||
                this.currentScanResult;


            if (!result) {

                return;

            }


            const compliance =
                this.getComplianceData(
                    result
                );


            const rules =
                Array.isArray(
                    compliance.rule_results
                )
                    ? compliance.rule_results
                    : [];


            const failures =
                rules.filter(
                    rule =>
                        String(
                            rule.status ||
                            ""
                        ).toUpperCase() ===
                        "FAIL"
                );


            const container =
                document.getElementById(
                    "violation-details-list"
                );


            if (!container) {

                this.navigateTo(
                    "page-12"
                );

                return;

            }


            if (!failures.length) {

                container.innerHTML =
                    `
                    <div class="p-6 rounded-xl border border-slate-200 bg-slate-50">

                        <div class="font-semibold text-slate-700">
                            No confirmed rule failures detected.
                        </div>

                        <div class="text-sm text-slate-500 mt-1">
                            Missing OCR evidence is not treated as a confirmed legal violation.
                        </div>

                    </div>
                    `;

                this.navigateTo(
                    "page-12"
                );

                return;

            }


            container.innerHTML =
                failures
                    .map(
                        rule => {

                            return `
                                <div class="p-5 rounded-xl border border-red-200 bg-red-50 mb-4">

                                    <div class="text-xs font-semibold text-red-600 uppercase">
                                        Confirmed Rule Failure
                                    </div>

                                    <h3 class="font-bold text-red-900 mt-1">
                                        ${this.escapeHtml(
                                            rule.name ||
                                            rule.rule ||
                                            "Legal Metrology Rule"
                                        )}
                                    </h3>

                                    <p class="text-sm text-red-800 mt-2">
                                        ${this.escapeHtml(
                                            rule.message ||
                                            rule.reason ||
                                            "The backend reported a rule failure."
                                        )}
                                    </p>

                                    ${
                                        rule.evidence
                                            ? `
                                                <div class="mt-3 p-3 rounded-lg bg-white border border-red-100">

                                                    <div class="text-xs font-semibold text-slate-500">
                                                        Evidence
                                                    </div>

                                                    <div class="text-sm text-slate-700 mt-1">
                                                        ${this.escapeHtml(
                                                            rule.evidence
                                                        )}
                                                    </div>

                                                </div>
                                            `
                                            : ""
                                    }

                                </div>
                            `;

                        }
                    )
                    .join("");


            this.navigateTo(
                "page-12"
            );

        },


    /* ========================================================
       SEARCH PAGE
       ======================================================== */

    renderFilteredHistory:
        function (
            results
        ) {

            const container =
                document.getElementById(
                    "history-list"
                );

            if (!container) {
                return;
            }

            const previous =
                this.historyCache;

            this.historyCache =
                Array.isArray(results)
                    ? results
                    : [];

            this.renderHistory();

            this.historyCache =
                previous;

        },


    performGlobalSearch:
        function () {

            const input =
                document.getElementById(
                    "global-search-input"
                );


            const query =
                input
                    ? input.value.trim()
                    : "";


            const history =
                this.loadStoredHistory();


            if (!query) {

                this.renderHistory();

                this.navigateTo(
                    "page-10"
                );

                return;

            }


            const normalized =
                query.toLowerCase();


            const results =
                history.filter(
                    item => {

                        const text =
                            [
                                item.productName,
                                item.manufacturer,
                                item.quantity,
                                item.mrp,
                                item.status,
                                item.filename
                            ]
                                .filter(Boolean)
                                .join(" ")
                                .toLowerCase();


                        return text.includes(
                            normalized
                        );

                    }
                );


            const container =
                document.getElementById(
                    "search-results-list"
                );


            if (!container) {

                this.renderFilteredHistory(
                    results
                );

                this.navigateTo(
                    "page-10"
                );

                return;

            }


            if (!results.length) {

                container.innerHTML =
                    `
                    <div class="p-6 text-center rounded-xl border border-slate-200 bg-slate-50">

                        <div class="font-semibold text-slate-700">
                            No results found
                        </div>

                        <div class="text-sm text-slate-500 mt-1">
                            Try a product name, manufacturer, MRP, batch number or status.
                        </div>

                    </div>
                    `;

                return;

            }


            container.innerHTML =
                results
                    .map(
                        (
                            item,
                            index
                        ) => {

                            return `
                                <button
                                    type="button"
                                    class="w-full text-left p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 mb-3"
                                    data-search-result-index="${index}"
                                >

                                    <div class="font-semibold text-slate-800">
                                        ${this.escapeHtml(
                                            item.productName ||
                                            "Unknown Product"
                                        )}
                                    </div>

                                    <div class="text-sm text-slate-500 mt-1">
                                        ${this.escapeHtml(
                                            item.manufacturer ||
                                            "Manufacturer not detected"
                                        )}
                                    </div>

                                    <div class="text-xs text-slate-500 mt-2">
                                        MRP:
                                        ${this.escapeHtml(
                                            item.mrp ||
                                            "Not detected"
                                        )}

                                        &nbsp; • &nbsp;

                                        Quantity:
                                        ${this.escapeHtml(
                                            item.quantity ||
                                            "Not detected"
                                        )}

                                    </div>

                                </button>
                            `;

                        }
                    )
                    .join("");


            container
                .querySelectorAll(
                    "[data-search-result-index]"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                const index =
                                    Number(
                                        button.dataset
                                            .searchResultIndex
                                    );


                                const item =
                                    results[index];


                                if (
                                    !item ||
                                    !item.result
                                ) {

                                    return;

                                }


                                this.currentScanResult =
                                    item.result;


                                this.renderAnalysisResult(
                                    item.result
                                );

                                this.renderDeclarations(
                                    item.result
                                );

                                this.renderViolations(
                                    item.result
                                );

                                this.renderReadability(
                                    item.result
                                );

                                this.renderCompliance(
                                    item.result
                                );

                                this.renderReport(
                                    item.result
                                );


                                this.navigateTo(
                                    "page-5"
                                );

                            }
                        );

                    }
                );

        },


    /* ========================================================
       SETTINGS
       ======================================================== */

    loadSettings:
        function () {

            try {

                const raw =
                    localStorage.getItem(
                        "lmcc_settings"
                    );


                if (!raw) {

                    return {};

                }


                const settings =
                    JSON.parse(
                        raw
                    );


                return (
                    settings &&
                    typeof settings ===
                        "object"
                )
                    ? settings
                    : {};

            } catch (
                error
            ) {

                console.warn(
                    "Could not load settings:",
                    error
                );


                return {};

            }

        },


    saveSettings:
        function (
            settings
        ) {

            if (
                !settings ||
                typeof settings !==
                    "object"
            ) {

                return;

            }


            try {

                localStorage.setItem(
                    "lmcc_settings",
                    JSON.stringify(
                        settings
                    )
                );

            } catch (
                error
            ) {

                console.warn(
                    "Could not save settings:",
                    error
                );

            }

        },


    resetSettings:
        function () {

            const confirmed =
                window.confirm(
                    "Reset application settings?"
                );


            if (!confirmed) {

                return;

            }


            try {

                localStorage.removeItem(
                    "lmcc_settings"
                );

            } catch (
                error
            ) {}


            location.reload();

        },
    /* ========================================================
       PDF REPORT
       ======================================================== */

    loadScript:
        function (
            src
        ) {

            return new Promise(
                (
                    resolve,
                    reject
                ) => {

                    const existing =
                        document.querySelector(
                            `script[src="${src}"]`
                        );


                    if (
                        existing
                    ) {

                        if (
                            existing.dataset
                                .loaded ===
                            "true"
                        ) {

                            resolve();

                        }

                        else {

                            existing.addEventListener(
                                "load",
                                () => resolve()
                            );

                            existing.addEventListener(
                                "error",
                                () =>
                                    reject(
                                        new Error(
                                            `Could not load ${src}`
                                        )
                                    )
                            );

                        }

                        return;

                    }


                    const script =
                        document.createElement(
                            "script"
                        );


                    script.src =
                        src;


                    script.onload =
                        () => {

                            script.dataset
                                .loaded =
                                "true";

                            resolve();

                        };


                    script.onerror =
                        () => {

                            reject(
                                new Error(
                                    `Could not load ${src}`
                                )
                            );

                        };


                    document.head.appendChild(
                        script
                    );

                }
            );

        },


    downloadPDF:
        async function () {

            const report =
                document.getElementById(
                    "page-9"
                );


            if (!report) {

                alert(
                    "Compliance report page is not available."
                );

                return;

            }


            try {

                /*
                 * Load libraries only when the
                 * user actually requests a PDF.
                 */

                if (
                    typeof html2canvas ===
                    "undefined"
                ) {

                    await this.loadScript(
                        "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
                    );

                }


                if (
                    typeof window.jspdf ===
                        "undefined" &&
                    typeof window.jsPDF ===
                        "undefined"
                ) {

                    await this.loadScript(
                        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
                    );

                }


                const canvas =
                    await html2canvas(
                        report,
                        {
                            scale:
                                1.5,

                            useCORS:
                                true,

                            backgroundColor:
                                "#ffffff"
                        }
                    );


                const jsPDFClass =
                    window.jspdf &&
                    window.jspdf.jsPDF
                        ? window.jspdf.jsPDF
                        : window.jsPDF;


                if (
                    !jsPDFClass
                ) {

                    throw new Error(
                        "PDF library was not loaded."
                    );

                }


                const pdf =
                    new jsPDFClass(
                        "p",
                        "mm",
                        "a4"
                    );


                const pageWidth =
                    pdf.internal.pageSize.getWidth();


                const pageHeight =
                    pdf.internal.pageSize.getHeight();


                const margin =
                    8;


                const usableWidth =
                    pageWidth -
                    margin * 2;


                const imageHeight =
                    canvas.height *
                    usableWidth /
                    canvas.width;


                let heightLeft =
                    imageHeight;


                let position =
                    margin;


                const imageData =
                    canvas.toDataURL(
                        "image/jpeg",
                        0.92
                    );


                pdf.addImage(
                    imageData,
                    "JPEG",
                    margin,
                    position,
                    usableWidth,
                    imageHeight
                );


                heightLeft -=
                    pageHeight -
                    margin * 2;


                while (
                    heightLeft >
                    0
                ) {

                    position =
                        margin -
                        (
                            imageHeight -
                            heightLeft
                        );


                    pdf.addPage();


                    pdf.addImage(
                        imageData,
                        "JPEG",
                        margin,
                        position,
                        usableWidth,
                        imageHeight
                    );


                    heightLeft -=
                        pageHeight -
                        margin * 2;

                }


                const reportId =
                    this.currentReportData &&
                    this.currentReportData.report_id
                        ? this.currentReportData.report_id
                        : "METRIYA-Report";


                pdf.save(
                    `${reportId}.pdf`
                );


            } catch (
                error
            ) {

                console.error(
                    "PDF generation failed:",
                    error
                );


                /*
                 * Safe fallback:
                 * open the report in the browser
                 * print dialog so the user can
                 * choose Save as PDF.
                 */

                alert(
                    "PDF generation could not load. The browser print dialog will be opened instead."
                );


                this.printReport();

            }

        },


    printReport:
        function () {

            const report =
                document.getElementById(
                    "page-9"
                );


            if (!report) {

                return;

            }


            const printWindow =
                window.open(
                    "",
                    "_blank",
                    "width=1000,height=800"
                );


            if (!printWindow) {

                alert(
                    "Please allow pop-ups to print the compliance report."
                );

                return;

            }


            printWindow.document.write(
                `
                <!DOCTYPE html>

                <html>

                <head>

                    <title>
                        METRIYA - Legal Metrology Inspection Report
                    </title>

                    <style>

                        body {
                            font-family:
                                Arial,
                                sans-serif;

                            margin:
                                24px;

                            color:
                                #111827;
                        }

                        * {
                            box-sizing:
                                border-box;
                        }

                        @media print {

                            body {
                                margin:
                                    10mm;
                            }

                        }

                    </style>

                </head>

                <body>

                    ${report.innerHTML}

                </body>

                </html>
                `
            );


            printWindow.document.close();


            printWindow.focus();


            setTimeout(
                () => {

                    printWindow.print();

                    printWindow.close();

                },
                500
            );

        },    /* ========================================================
       EXCEL / CSV-STYLE REPORT
       ======================================================== */

    downloadExcel:
        function () {

            const result =
                this.currentScanResult;


            if (!result) {

                alert(
                    "No scan result is available for export."
                );

                return;

            }


            const report =
                this.currentReportData ||
                {};


            const compliance =
                this.getComplianceData(
                    result
                );


            const rows = [

                [
                    "Field",
                    "Value"
                ],

                [
                    "Report ID",
                    report.report_id ||
                    result.scan_id ||
                    "METRIYA-SCAN"
                ],

                [
                    "Inspection Date",
                    report.inspection_date ||
                    new Date()
                        .toLocaleDateString()
                ],

                [
                    "Product Name",
                    report.product_name ||
                    this.getField(
                        result,
                        "product_name"
                    ) ||
                    "Not detected"
                ],

                [
                    "Manufacturer",
                    report.manufacturer ||
                    this.getField(
                        result,
                        "manufacturer",
                        "manufacturer_name",
                        "manufacturer_or_marketer"
                    ) ||
                    "Not detected"
                ],

                [
                    "Net Quantity",
                    report.net_quantity ||
                    this.getField(
                        result,
                        "net_quantity",
                        "quantity",
                        "net_weight"
                    ) ||
                    "Not detected"
                ],

                [
                    "MRP",
                    report.mrp ||
                    this.getField(
                        result,
                        "mrp",
                        "maximum_retail_price"
                    ) ||
                    "Not detected"
                ],

                [
                    "Batch / Lot",
                    report.batch ||
                    this.getField(
                        result,
                        "batch",
                        "batch_no",
                        "batch_number",
                        "lot_no"
                    ) ||
                    "Not detected"
                ],

                [
                    "Manufacturing / Packing Date",
                    report.manufacturing_date ||
                    this.getField(
                        result,
                        "mfd",
                        "manufacturing_date",
                        "packed_date",
                        "pkd"
                    ) ||
                    "Not detected"
                ],

                [
                    "Expiry / Use By",
                    report.expiry_date ||
                    this.getField(
                        result,
                        "expiry",
                        "expiry_date",
                        "use_by",
                        "best_before"
                    ) ||
                    "Not detected"
                ],

                [
                    "FSSAI",
                    report.fssai ||
                    this.getField(
                        result,
                        "fssai",
                        "fssai_license"
                    ) ||
                    "Not detected"
                ],

                [
                    "Customer Care",
                    report.customer_care ||
                    this.getField(
                        result,
                        "customer_care",
                        "customer_care_details"
                    ) ||
                    "Not detected"
                ],

                [
                    "Compliance Status",
                    report.compliance_status ||
                    this.getComplianceStatus(
                        result
                    )
                ],

                [
                    "Detection Percentage",
                    `${Math.round(
                        Number(
                            report.detection_percentage ||
                            compliance.detection_percentage ||
                            0
                        )
                    )}%`
                ]

            ];


            /*
             * Add rule results below the
             * main extracted declaration table.
             */

            rows.push(
                [],
                [
                    "Compliance Rule",
                    "Status",
                    "Message"
                ]
            );


            const rules =
                Array.isArray(
                    compliance.rule_results
                )
                    ? compliance.rule_results
                    : [];


            rules.forEach(
                rule => {

                    rows.push(
                        [
                            rule.name ||
                            rule.rule ||
                            "Compliance Rule",

                            rule.status ||
                            "REVIEW_REQUIRED",

                            rule.message ||
                            rule.reason ||
                            ""

                        ]
                    );

                }
            );


            /*
             * CSV generation.
             */

            const csv =
                rows
                    .map(
                        row =>
                            row
                                .map(
                                    cell => {

                                        const value =
                                            String(
                                                cell ??
                                                ""
                                            )
                                                .replace(
                                                    /"/g,
                                                    "\"\""
                                                );


                                        return `"${value}"`;

                                    }
                                )
                                .join(",")
                    )
                    .join("\r\n");


            const blob =
                new Blob(
                    [
                        "\uFEFF" +
                        csv
                    ],
                    {
                        type:
                            "text/csv;charset=utf-8;"
                    }
                );


            const url =
                URL.createObjectURL(
                    blob
                );


            const link =
                document.createElement(
                    "a"
                );


            link.href =
                url;


            const reportId =
                report.report_id ||
                result.scan_id ||
                "METRIYA-Report";


            link.download =
                `${reportId}.csv`;


            document.body.appendChild(
                link
            );


            link.click();


            link.remove();


            setTimeout(
                () => {

                    URL.revokeObjectURL(
                        url
                    );

                },
                1000
            );

        },


    /* ========================================================
       CAPTURE / CAMERA COMPATIBILITY
       ======================================================== */

    openCamera:
        function () {

            const input =
                document.getElementById(
                    "camera-input"
                );


            if (!input) {

                return;

            }


            /*
             * On supported mobile browsers,
             * capture opens the camera.
             */

            input.setAttribute(
                "capture",
                "environment"
            );


            input.click();

        },


    triggerFilePicker:
        function () {

            const input =
                document.getElementById(
                    "file-input"
                );


            if (
                input
            ) {

                input.removeAttribute(
                    "capture"
                );


                input.click();

            }

        },


    /* ========================================================
       NAVIGATION HELPERS
       ======================================================== */

    goToScan:
        function () {

            this.navigateTo(
                "page-4"
            );

        },


    goToHome:
        function () {

            this.navigateTo(
                "page-3"
            );

        },


    goToHistory:
        function () {

            this.renderHistory();

            this.navigateTo(
                "page-10"
            );

        },


    goToReport:
        function () {

            if (
                this.currentScanResult
            ) {

                this.renderReport(
                    this.currentScanResult
                );

            }


            this.navigateTo(
                "page-9"
            );

        },


    /* ========================================================
       KEYBOARD SHORTCUTS
       ======================================================== */

    setupKeyboardShortcuts:
        function () {

            if (
                document.body.dataset
                    .lmccKeyboardReady ===
                "true"
            ) {

                return;

            }


            document.body.dataset
                .lmccKeyboardReady =
                "true";


            document.addEventListener(
                "keydown",
                event => {

                    /*
                     * Escape closes the drawer.
                     */

                    if (
                        event.key ===
                        "Escape"
                    ) {

                        if (
                            typeof this.closeDrawer ===
                            "function"
                        ) {

                            this.closeDrawer();

                        }

                    }


                    /*
                     * Ctrl/Cmd + K focuses
                     * the global search input.
                     */

                    if (
                        (
                            event.ctrlKey ||
                            event.metaKey
                        ) &&
                        event.key.toLowerCase() ===
                            "k"
                    ) {

                        event.preventDefault();


                        const search =
                            document.getElementById(
                                "global-search-input"
                            );


                        if (
                            search
                        ) {

                            search.focus();

                        }

                    }

                }
            );

        },


    /* ========================================================
       PAGE-SPECIFIC INITIALIZATION
       ======================================================== */

    initializeCurrentPage:
        function (
            pageId
        ) {

            switch (
                pageId
            ) {

                case "page-3":

                    this.updateDashboardStats();

                    break;


                case "page-10":

                    this.renderHistory();

                    break;


                case "page-11":

                    this.renderEnforcementDashboard();

                    break;


                case "page-12":

                    this.renderViolationDetails();

                    break;


                case "page-9":

                    if (
                        this.currentScanResult
                    ) {

                        this.renderReport(
                            this.currentScanResult
                        );

                    }

                    break;


                default:

                    break;

            }


            this.refreshIcons();

        },


    /* ========================================================
       FINAL APPLICATION INITIALIZATION
       ======================================================== */

    finalizeInitialization:
        function () {

            try {

                this.setupKeyboardShortcuts();

            } catch (
                error
            ) {

                console.warn(
                    "Keyboard shortcut setup skipped:",
                    error
                );

            }


            try {

                this.updateDashboardStats();

            } catch (
                error
            ) {

                console.warn(
                    "Dashboard initialization skipped:",
                    error
                );

            }


            try {

                this.renderHistory();

            } catch (
                error
            ) {

                console.warn(
                    "History initialization skipped:",
                    error
                );

            }


            try {

                this.refreshIcons();

            } catch (
                error
            ) {

                console.warn(
                    "Icon initialization skipped:",
                    error
                );

            }

        },


    /* ========================================================
       END OF APPLICATION OBJECT
       ======================================================== */

};/* ============================================================
   APPLICATION STARTUP
   ============================================================ */

(function () {

    function startLMCCApp() {

        try {

            if (
                window.LMCC_App &&
                typeof window.LMCC_App.init ===
                    "function"
            ) {

                window.LMCC_App.init();

            }


            if (
                window.LMCC_App &&
                typeof window.LMCC_App.finalizeInitialization ===
                    "function"
            ) {

                window.LMCC_App.finalizeInitialization();

            }


            console.log(
                "METRIYA App initialized successfully."
            );


        } catch (
            error
        ) {

            console.error(
                "METRIYA App initialization failed:",
                error
            );

        }

    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            startLMCCApp,
            {
                once:
                    true
            }
        );

    } else {

        startLMCCApp();

    }

})();


/* ============================================================
   LMCC FINAL DATA / UI RECTIFICATION PATCH
   ============================================================ */
(function () {

    function clean(value) {

        if (
            value === null ||
            value === undefined
        ) {
            return "";
        }

        if (
            typeof value === "object"
        ) {

            if (
                Object.prototype.hasOwnProperty.call(
                    value,
                    "value"
                )
            ) {
                return clean(value.value);
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    value,
                    "text"
                )
            ) {
                return clean(value.text);
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    value,
                    "raw"
                )
            ) {
                return clean(value.raw);
            }

            return "";
        }

        const text =
            String(value).trim();

        if (
            !text ||
            /^(null|undefined|none|n\/a|na|not detected|-)$/.test(
                text.toLowerCase()
            )
        ) {
            return "";
        }

        return text;
    }

    function resultObject(data) {

        if (
            data &&
            Array.isArray(data.images) &&
            data.images.length
        ) {
            return data.images[0];
        }

        if (
            data &&
            data.result &&
            typeof data.result === "object"
        ) {
            return data.result;
        }

        if (
            data &&
            Array.isArray(data.results) &&
            data.results.length
        ) {
            return data.results[0];
        }

        return data || {};
    }

    function fieldsObject(data) {

        const result =
            resultObject(data);

        if (
            result &&
            result.fields &&
            typeof result.fields === "object"
        ) {
            return result.fields;
        }

        if (
            data &&
            data.fields &&
            typeof data.fields === "object"
        ) {
            return data.fields;
        }

        if (
            result &&
            result.extracted_data &&
            typeof result.extracted_data === "object"
        ) {
            return result.extracted_data;
        }

        if (
            data &&
            data.extracted_data &&
            typeof data.extracted_data === "object"
        ) {
            return data.extracted_data;
        }

        return {};
    }

    function field(data, ...names) {

        const result =
            resultObject(data);

        const fields =
            fieldsObject(data);

        for (
            const name of names
        ) {

            if (
                result &&
                Object.prototype.hasOwnProperty.call(
                    result,
                    name
                )
            ) {

                const value =
                    clean(result[name]);

                if (value) {
                    return value;
                }
            }

            if (
                fields &&
                Object.prototype.hasOwnProperty.call(
                    fields,
                    name
                )
            ) {

                const value =
                    clean(fields[name]);

                if (value) {
                    return value;
                }
            }
        }

        return "";
    }

    function compliance(data) {

        if (
            data &&
            data.compliance &&
            typeof data.compliance === "object"
        ) {
            return data.compliance;
        }

        const result =
            resultObject(data);

        if (
            result &&
            result.compliance &&
            typeof result.compliance === "object"
        ) {
            return result.compliance;
        }

        return {};
    }

    function numberValue(value, fallback = 0) {

        const n =
            Number(value);

        return Number.isFinite(n)
            ? n
            : fallback;
    }

    function statusOf(data) {

        const c =
            compliance(data);

        const raw =
            clean(
                c.status ||
                c.overall_status
            ).toUpperCase();

        if (
            raw === "PASS" ||
            raw === "COMPLIANT"
        ) {
            return "PASS";
        }

        if (
            raw === "FAIL" ||
            raw === "NON_COMPLIANT" ||
            raw === "NON-COMPLIANT"
        ) {
            return "FAIL";
        }

        return "REVIEW_REQUIRED";
    }

    function statusLabel(status) {

        if (status === "PASS") {
            return "Compliant";
        }

        if (status === "FAIL") {
            return "Non-Compliant";
        }

        return "Review Required";
    }

    function setText(id, value, fallback = "Not Detected") {

        const element =
            document.getElementById(id);

        if (!element) {
            return;
        }

        element.textContent =
            clean(value) || fallback;
    }

    function setStatusClass(element, status) {

        if (!element) {
            return;
        }

        element.classList.remove(
            "bg-green-100",
            "text-green-700",
            "border-green-200",
            "bg-red-100",
            "text-red-700",
            "border-red-200",
            "bg-yellow-100",
            "text-yellow-700",
            "border-yellow-200",
            "text-green-600",
            "text-red-600",
            "text-yellow-600"
        );

        if (status === "PASS") {

            element.classList.add(
                "bg-green-100",
                "text-green-700",
                "border-green-200"
            );

            return;
        }

        if (status === "FAIL") {

            element.classList.add(
                "bg-red-100",
                "text-red-700",
                "border-red-200"
            );

            return;
        }

        element.classList.add(
            "bg-yellow-100",
            "text-yellow-700",
            "border-yellow-200"
        );
    }

    function detectedField(data, key) {

        const f =
            fieldsObject(data)[key];

        if (
            f &&
            typeof f === "object"
        ) {

            return {
                value: clean(f),
                found:
                    String(
                        f.status || ""
                    ).toUpperCase() === "FOUND"
            };
        }

        const value =
            clean(f);

        return {
            value: value,
            found: Boolean(value)
        };
    }

    /* --------------------------------------------------------
       FIX: nested backend fields
       -------------------------------------------------------- */

    LMCC_App.getField =
        function (
            data,
            ...names
        ) {
            return field(
                data,
                ...names
            );
        };

    LMCC_App.getFieldText =
        function (
            data,
            ...names
        ) {
            return field(
                data,
                ...names
            );
        };

    LMCC_App.getComplianceData =
        function (data) {
            return compliance(data);
        };

    /* --------------------------------------------------------
       PAGE 5 — ANALYSIS RESULT
       -------------------------------------------------------- */

    LMCC_App.renderAnalysisResult =
        function (data) {

            if (!data) {
                return;
            }

            this.currentScanResult =
                data;

            const status =
                statusOf(data);

            const c =
                compliance(data);

            const score =
                Math.max(
                    0,
                    Math.min(
                        100,
                        numberValue(
                            c.detection_percentage ??
                            c.detection_score,
                            0
                        )
                    )
                );

            const product =
                field(
                    data,
                    "product_name",
                    "product",
                    "name"
                );

            const mrp =
                field(
                    data,
                    "mrp",
                    "maximum_retail_price",
                    "max_retail_price"
                );

            const quantity =
                field(
                    data,
                    "net_quantity",
                    "quantity",
                    "net_weight"
                );

            const batch =
                field(
                    data,
                    "batch",
                    "batch_no",
                    "batch_number",
                    "lot_no"
                );

            setText(
                "result-product-title",
                product,
                "Scanned Product"
            );

            setText(
                "result-status-text",
                statusLabel(status),
                "Review Required"
            );

            const badge =
                document.getElementById(
                    "result-status-badge"
                );

            setStatusClass(
                badge,
                status
            );

            const icon =
                document.getElementById(
                    "result-status-icon"
                );

            if (icon) {
                icon.textContent =
                    status === "PASS"
                        ? "🟢"
                        : status === "FAIL"
                            ? "🔴"
                            : "🟡";
            }

            setText(
                "result-compliance-score",
                `${score} / 100`,
                "0 / 100"
            );

            setText(
                "result-score-val",
                `${score} / 100`,
                "0 / 100"
            );

            const bar =
                document.getElementById(
                    "result-score-bar"
                );

            if (bar) {
                bar.style.width =
                    `${score}%`;
            }

            const summary =
                document.getElementById(
                    "result-summary-message"
                );

            if (summary) {

                summary.textContent =
                    clean(
                        c.summary
                    ) ||
                    (
                        status === "PASS"
                            ? "All implemented OCR-based declaration checks passed."
                            : status === "FAIL"
                                ? "Confirmed declaration failures were detected."
                                : "Some declaration checks require review."
                    );

                summary.classList.remove(
                    "bg-green-50",
                    "text-green-800",
                    "border-green-200",
                    "bg-red-50",
                    "text-red-800",
                    "border-red-200",
                    "bg-yellow-50",
                    "text-yellow-800",
                    "border-yellow-200"
                );

                if (status === "PASS") {
                    summary.classList.add(
                        "bg-green-50",
                        "text-green-800",
                        "border-green-200"
                    );
                } else if (status === "FAIL") {
                    summary.classList.add(
                        "bg-red-50",
                        "text-red-800",
                        "border-red-200"
                    );
                } else {
                    summary.classList.add(
                        "bg-yellow-50",
                        "text-yellow-800",
                        "border-yellow-200"
                    );
                }
            }

            const findings =
                document.getElementById(
                    "result-key-findings"
                );

            if (findings) {

                const rules =
                    Array.isArray(
                        c.rule_results
                    )
                        ? c.rule_results
                        : [];

                const failures =
                    rules.filter(
                        rule =>
                            String(
                                rule.status || ""
                            ).toUpperCase() === "FAIL"
                    );

                const reviews =
                    rules.filter(
                        rule =>
                            String(
                                rule.status || ""
                            ).toUpperCase() === "REVIEW_REQUIRED"
                    );

                findings.innerHTML = "";

                const items = [];

                if (
                    status === "PASS"
                ) {
                    items.push(
                        "All mandatory OCR declarations found"
                    );
                }

                if (
                    failures.length
                ) {
                    items.push(
                        `${failures.length} confirmed declaration failure(s)`
                    );
                }

                if (
                    reviews.length
                ) {
                    items.push(
                        `${reviews.length} declaration check(s) require review`
                    );
                }

                items.push(
                    "Readability and physical placement require visual verification"
                );

                items.forEach(
                    text => {

                        const row =
                            document.createElement(
                                "div"
                            );

                        row.className =
                            "flex items-center text-green-700";

                        row.innerHTML =
                            `<span class="mr-2">✓</span>${text}`;

                        findings.appendChild(
                            row
                        );
                    }
                );
            }

            const image =
                document.getElementById(
                    "result-uploaded-image"
                );

            if (
                image &&
                Array.isArray(
                    this.selectedFiles
                ) &&
                this.selectedFiles.length
            ) {

                if (this.previewObjectUrl) {
                    try {
                        URL.revokeObjectURL(
                            this.previewObjectUrl
                        );
                    } catch (error) {}
                }

                this.previewObjectUrl =
                    URL.createObjectURL(
                        this.selectedFiles[0]
                    );

                image.src =
                    this.previewObjectUrl;

                image.classList.remove(
                    "hidden"
                );
            }

            this.renderDeclarations(data);
            this.renderCompliancePage(data);
            this.renderReadability(data);
            this.renderReport(data);
        };

    /* --------------------------------------------------------
       PAGE 7 — COMPLIANCE REPORT
       -------------------------------------------------------- */

    LMCC_App.renderCompliancePage =
        function (data) {

            const c =
                compliance(data);

            const status =
                statusOf(data);

            const score =
                Math.max(
                    0,
                    Math.min(
                        100,
                        numberValue(
                            c.detection_percentage ??
                            c.detection_score,
                            0
                        )
                    )
                );

            setText(
                "report-status-text",
                (
                    status === "PASS"
                        ? "🟢 Compliant"
                        : status === "FAIL"
                            ? "🔴 Non-Compliant"
                            : "🟡 Review Required"
                ),
                "🟡 Review Required"
            );

            setText(
                "report-score",
                `${score} / 100`,
                "0 / 100"
            );

            const statusBox =
                document.getElementById(
                    "report-status-text"
                );

            if (statusBox) {
                statusBox.parentElement &&
                    setStatusClass(
                        statusBox.parentElement,
                        status
                    );
            }

            const violations =
                document.getElementById(
                    "report-violations"
                );

            if (violations) {

                const rules =
                    Array.isArray(
                        c.rule_results
                    )
                        ? c.rule_results
                        : [];

                const failures =
                    rules.filter(
                        rule =>
                            String(
                                rule.status || ""
                            ).toUpperCase() === "FAIL"
                    );

                if (!failures.length) {

                    violations.innerHTML =
                        `
                        <div class="p-4 rounded-2xl border border-green-200 bg-green-50">
                            <div class="font-semibold text-green-800">
                                No confirmed violations detected.
                            </div>
                            <div class="text-xs text-green-700 mt-1">
                                Missing OCR evidence is not treated as a confirmed legal violation.
                            </div>
                        </div>
                        `;

                } else {

                    violations.innerHTML =
                        failures
                            .map(
                                rule =>
                                    `
                                    <div class="p-4 rounded-2xl border border-red-200 bg-red-50">
                                        <div class="font-semibold text-red-800">
                                            ${String(
                                                rule.requirement ||
                                                rule.field ||
                                                "Compliance requirement"
                                            )}
                                        </div>
                                        <div class="text-xs text-red-700 mt-1">
                                            ${String(
                                                rule.message ||
                                                "Confirmed failure detected."
                                            )}
                                        </div>
                                    </div>
                                    `
                            )
                            .join("");
                }
            }

            const page =
                document.getElementById(
                    "page-7"
                );

            if (page) {

                const recommendationBlocks =
                    page.querySelectorAll(
                        ".bg-amber-50"
                    );

                if (
                    status === "PASS"
                ) {

                    recommendationBlocks.forEach(
                        block => {

                            block.innerHTML =
                                `<span class="mr-2">✓</span> No corrective declaration action is required from the OCR checks.`;

                            block.classList.remove(
                                "bg-amber-50",
                                "border-amber-200",
                                "text-amber-900"
                            );

                            block.classList.add(
                                "bg-green-50",
                                "border-green-200",
                                "text-green-800"
                            );
                        }
                    );
                }
            }
        };

    /* --------------------------------------------------------
       PAGE 8 — READABILITY
       -------------------------------------------------------- */

    LMCC_App.renderReadability =
        function (data) {

            const page =
                document.getElementById(
                    "page-8"
                );

            if (!page) {
                return;
            }

            const status =
                statusOf(data);

            const mrp =
                field(
                    data,
                    "mrp",
                    "maximum_retail_price",
                    "max_retail_price"
                );

            const fieldRows = [
                ["Product Name", "product_name"],
                ["Net Quantity", "net_quantity"],
                ["Batch No.", "batch"],
                ["Manufacturing Date", "manufacturing_date"],
                ["Best Before / Expiry", "expiry_date"],
                ["FSSAI No.", "fssai"]
            ];

            const rows =
                fieldRows
                    .map(
                        ([label, key]) => {

                            const info =
                                detectedField(
                                    data,
                                    key
                                );

                            const good =
                                info.found;

                            return `
                            <div class="p-3 rounded-xl ${
                                good
                                    ? "bg-green-50 border-green-200 text-green-800"
                                    : "bg-yellow-50 border-yellow-200 text-yellow-800"
                            } border flex items-center justify-between">
                                <span>${label}</span>
                                <span class="font-bold">
                                    ${
                                        good
                                            ? "✓ Detected"
                                            : "⚠ Review"
                                    }
                                </span>
                            </div>
                            `;
                        }
                    )
                    .join("");

            page.innerHTML =
                `
                <div class="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-md space-y-6">

                    <h2 class="text-2xl font-extrabold text-navy-800 pb-4 border-b border-slate-100">
                        Font & Readability Analysis
                    </h2>

                    <div class="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">

                        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">
                            M.R.P. Analysis
                        </h3>

                        <div class="text-xl font-bold text-navy-800">
                            M.R.P. ${
                                mrp || "Not detected"
                            }
                        </div>

                        <div class="grid grid-cols-2 gap-4 text-xs">

                            <div>
                                <span class="text-slate-500">
                                    Detected Font Size:
                                </span>

                                <div class="text-base font-bold text-yellow-600">
                                    Not measured
                                </div>
                            </div>

                            <div>
                                <span class="text-slate-500">
                                    Required:
                                </span>

                                <div class="text-base font-bold text-slate-800">
                                    ≥ 1.0 mm
                                </div>
                            </div>

                        </div>

                        <div class="pt-2 text-xs font-extrabold text-yellow-600 flex items-center">
                            <span class="mr-1.5">🟡</span>
                            Physical font-size verification required
                        </div>

                    </div>

                    <div>
                        <h3 class="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
                            Declared Fields Legibility
                        </h3>

                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-semibold">
                            ${rows}
                        </div>
                    </div>

                    <div class="p-4 rounded-2xl bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm font-bold flex items-center">
                        <span class="mr-2">🟡</span>
                        ${
                            status === "PASS"
                                ? "OCR declarations are clear. Physical readability still requires visual verification."
                                : "Readability and font size require visual verification."
                        }
                    </div>

                    <button onclick="LMCC_App.navigateTo('page-9')" class="w-full py-4 bg-navy-800 hover:bg-navy-900 text-white font-bold rounded-2xl shadow flex items-center justify-center gap-2">
                        <span>→ Continue to METRIYA - Legal Metrology Inspection Report</span>
                        <span>→</span>
                    </button>

                </div>
                `;

            try {
                if (window.lucide) {
                    window.lucide.createIcons();
                }
            } catch (error) {}
        };

    /* --------------------------------------------------------
       PAGE 9 — FINAL REPORT
       -------------------------------------------------------- */

    LMCC_App.renderReport =
        function (data) {

            const c =
                compliance(data);

            const status =
                statusOf(data);

            const score =
                Math.max(
                    0,
                    Math.min(
                        100,
                        numberValue(
                            c.detection_percentage ??
                            c.detection_score,
                            0
                        )
                    )
                );

            const product =
                field(
                    data,
                    "product_name",
                    "product",
                    "name"
                );

            const manufacturer =
                field(
                    data,
                    "manufacturer_or_marketer",
                    "manufacturer",
                    "manufacturer_name"
                );

            const address =
                field(
                    data,
                    "manufacturer_address",
                    "address",
                    "manufacturerAddress"
                );

            const quantity =
                field(
                    data,
                    "net_quantity",
                    "quantity",
                    "net_weight"
                );

            const mrp =
                field(
                    data,
                    "mrp",
                    "maximum_retail_price",
                    "max_retail_price"
                );

            const batch =
                field(
                    data,
                    "batch",
                    "batch_no",
                    "batch_number",
                    "lot_no"
                );

            const mfd =
                field(
                    data,
                    "manufacturing_date",
                    "mfd",
                    "pkd",
                    "packed_date"
                );

            const expiry =
                field(
                    data,
                    "expiry_date",
                    "expiry",
                    "use_by",
                    "best_before"
                );

            const fssai =
                field(
                    data,
                    "fssai",
                    "fssai_license",
                    "license_no"
                );

            const customerCare =
                field(
                    data,
                    "customer_care",
                    "customerCare",
                    "consumer_care"
                );

            setText(
                "report-product-name",
                product,
                "Scanned Product"
            );

            setText(
                "report-manufacturer",
                manufacturer
            );

            setText(
                "report-id",
                "METRIYA-SCAN"
            );

            setText(
                "report-date",
                new Date().toLocaleString("en-IN")
            );

            setText(
                "report-mrp",
                mrp
            );

            setText(
                "report-quantity",
                quantity
            );

            setText(
                "report-batch",
                batch
            );

            setText(
                "report-mfd",
                mfd
            );

            setText(
                "report-expiry",
                expiry
            );

            setText(
                "report-fssai",
                fssai
            );

            setText(
                "report-address",
                address
            );

            setText(
                "report-customer-care",
                customerCare
            );

            setText(
                "report-status",
                (
                    status === "PASS"
                        ? "🟢 Compliant"
                        : status === "FAIL"
                            ? "🔴 Non-Compliant"
                            : "🟡 Review Required"
                ),
                "🟡 Review Required"
            );

            setText(
                "report-mandatory-status",
                status === "PASS"
                    ? "PASS"
                    : status === "FAIL"
                        ? "FAIL"
                        : "REVIEW"
            );

            setText(
                "report-readability-status",
                "REVIEW"
            );

            setText(
                "report-placement-status",
                "REVIEW"
            );

            const overall =
                document.getElementById(
                    "report-status"
                );

            if (overall) {
                setStatusClass(
                    overall,
                    status
                );
            }

            /* Keep export/report data synchronized. */
            this.currentReportData = {
                product_name: product,
                manufacturer: manufacturer,
                manufacturer_address: address,
                net_quantity: quantity,
                mrp: mrp,
                batch: batch,
                manufacturing_date: mfd,
                expiry_date: expiry,
                fssai: fssai,
                customer_care: customerCare,
                compliance_status:
                    statusLabel(status),
                detection_percentage:
                    score,
                rule_results:
                    Array.isArray(
                        c.rule_results
                    )
                        ? c.rule_results
                        : []
            };
        };

    /* --------------------------------------------------------
       DASHBOARD — remove demo counters
       -------------------------------------------------------- */

    LMCC_App.updateDashboardStats =
        function () {

            const history =
                typeof this.loadStoredHistory === "function"
                    ? this.loadStoredHistory()
                    : [];

            const total =
                history.length;

            const compliant =
                history.filter(
                    item =>
                        String(
                            item.status || ""
                        ).toUpperCase() ===
                        "COMPLIANT"
                ).length;

            const nonCompliant =
                history.filter(
                    item =>
                        String(
                            item.status || ""
                        ).toUpperCase() ===
                        "NON_COMPLIANT"
                ).length;

            setText(
                "stat-total-scans",
                total,
                "0"
            );

            setText(
                "stat-compliant-scans",
                compliant,
                "0"
            );

            setText(
                "stat-noncompliant-scans",
                nonCompliant,
                "0"
            );
        };

    /* Re-render the currently displayed result when page 9 is opened. */
    const originalNavigate =
        LMCC_App.navigateTo;

    LMCC_App.navigateTo =
        function (pageId) {

            if (
                typeof originalNavigate ===
                "function"
            ) {
                originalNavigate.call(
                    this,
                    pageId
                );
            }

            if (
                pageId === "page-7" ||
                pageId === "page-8" ||
                pageId === "page-9"
            ) {

                if (
                    this.currentScanResult
                ) {

                    this.renderCompliancePage(
                        this.currentScanResult
                    );

                    this.renderReadability(
                        this.currentScanResult
                    );

                    this.renderReport(
                        this.currentScanResult
                    );
                }
            }
        };

    /* Run once after the patch is installed. */
    try {
        LMCC_App.updateDashboardStats();
    } catch (error) {}

})();

