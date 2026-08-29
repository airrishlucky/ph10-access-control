(function () {
    "use strict";

    const STORAGE_DEVICE = "ph10_device_id";
    const STORAGE_USERNAME = "ph10_username";

    function getDeviceId() {
        let id = localStorage.getItem(STORAGE_DEVICE);

        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(STORAGE_DEVICE, id);
        }

        return id;
    }

    function getUsername() {
        return localStorage.getItem(STORAGE_USERNAME);
    }

    function setUsername(username) {
        localStorage.setItem(STORAGE_USERNAME, username);
    }

    function normalizeUsername(username) {
        return String(username || "")
            .trim()
            .toLowerCase();
    }

    function getConfig() {
        const config = window.PH10_ACCESS_CONFIG;

        if (!config) {
            throw new Error(
                "PH10 Access Control: configuration not found."
            );
        }

        if (!config.usersUrl) {
            throw new Error(
                "PH10 Access Control: usersUrl not configured."
            );
        }

        return config;
    }

    async function getDatabase() {
        const config = getConfig();

        const response = await fetch(
            config.usersUrl + "?v=" + Date.now(),
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(
                "PH10 Access Control: unable to load users.json."
            );
        }

        const data = await response.json();

        if (!data || !Array.isArray(data.users)) {
            throw new Error(
                "PH10 Access Control: invalid users.json."
            );
        }

        return data;
    }

    function createStyle() {
        const style = document.createElement("style");

        style.id = "ph10-access-style";

        style.textContent = `
            #ph10-access-overlay {
                position: fixed;
                inset: 0;
                z-index: 2147483647;

                display: flex;
                align-items: center;
                justify-content: center;

                background: rgba(0,0,0,.78);

                font-family: Arial, sans-serif;
            }

            .ph10-access-box {
                width: 360px;
                max-width: calc(100vw - 40px);

                box-sizing: border-box;

                padding: 28px;

                background: #181818;
                color: #fff;

                border-radius: 18px;

                box-shadow:
                    0 20px 70px rgba(0,0,0,.55);

                text-align: center;
            }

            .ph10-access-title {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 10px;
            }

            .ph10-access-subtitle {
                color: #bdbdbd;
                margin-bottom: 20px;
                line-height: 1.45;
            }

            #ph10-access-username {
                width: 100%;
                box-sizing: border-box;

                padding: 12px;

                border: 1px solid #555;
                border-radius: 9px;

                background: #242424;
                color: #fff;

                font-size: 16px;
                outline: none;
            }

            #ph10-access-continue {
                width: 100%;

                margin-top: 12px;

                padding: 12px;

                border: 0;
                border-radius: 9px;

                font-size: 16px;
                font-weight: bold;

                cursor: pointer;
            }

            #ph10-access-message {
                min-height: 22px;

                margin-top: 15px;

                line-height: 1.45;
                font-size: 14px;
            }
        `;

        document.head.appendChild(style);

        return style;
    }

    function showAccessScreen() {
        const old =
            document.getElementById(
                "ph10-access-overlay"
            );

        if (old) {
            old.remove();
        }

        const style = createStyle();

        const overlay =
            document.createElement("div");

        overlay.id =
            "ph10-access-overlay";

        overlay.innerHTML = `
            <div class="ph10-access-box">

                <div class="ph10-access-title">
                    PH10 Access Control
                </div>

                <div class="ph10-access-subtitle">
                    Enter your username to continue.
                </div>

                <input
                    id="ph10-access-username"
                    type="text"
                    maxlength="50"
                    autocomplete="off"
                    placeholder="Username"
                >

                <button id="ph10-access-continue">
                    Continue
                </button>

                <div id="ph10-access-message"></div>

            </div>
        `;

        document.body.appendChild(overlay);

        return {
            overlay,
            style,

            input:
                document.getElementById(
                    "ph10-access-username"
                ),

            button:
                document.getElementById(
                    "ph10-access-continue"
                ),

            message:
                document.getElementById(
                    "ph10-access-message"
                )
        };
    }

    function closeAccessScreen(screen) {
        screen.overlay.remove();
        screen.style.remove();
    }

    function showMessage(
        screen,
        text
    ) {
        screen.message.textContent = text;
    }

    function checkUser(
        database,
        username,
        deviceId
    ) {
        const normalized =
            normalizeUsername(username);

        return database.users.find(
            user =>
                normalizeUsername(
                    user.username
                ) === normalized
        ) || null;
    }

    async function require(toolId) {
        const config = getConfig();

        const deviceId = getDeviceId();

        const database =
            await getDatabase();

        const savedUsername =
            getUsername();

        /*
         * Existing username saved
         */
        if (savedUsername) {

            const user =
                checkUser(
                    database,
                    savedUsername,
                    deviceId
                );

            if (!user) {
                localStorage.removeItem(
                    STORAGE_USERNAME
                );
            } else {

                if (user.enabled === false) {
                    throw new Error(
                        "PH10_ACCESS_DISABLED"
                    );
                }

                const devices =
                    Array.isArray(
                        user.devices
                    )
                        ? user.devices
                        : [];

                if (
                    devices.includes(
                        deviceId
                    )
                ) {
                    return {
                        allowed: true,
                        status: "active",
                        username:
                            user.username,
                        deviceId,
                        toolId
                    };
                }

                throw new Error(
                    "PH10_ACCESS_DEVICE_PENDING"
                );
            }
        }

        /*
         * Ask for username
         */
        const screen =
            showAccessScreen();

        return new Promise(
            async (resolve, reject) => {

                async function submit() {

                    const username =
                        screen.input.value.trim();

                    if (!username) {
                        showMessage(
                            screen,
                            "Please enter a username."
                        );
                        return;
                    }

                    if (username.length < 2) {
                        showMessage(
                            screen,
                            "Username must contain at least 2 characters."
                        );
                        return;
                    }

                    screen.button.disabled =
                        true;

                    showMessage(
                        screen,
                        "Checking access..."
                    );

                    try {

                        const latest =
                            await getDatabase();

                        const user =
                            checkUser(
                                latest,
                                username,
                                deviceId
                            );

                        /*
                         * Existing account
                         */
                        if (user) {

                            if (
                                user.enabled ===
                                false
                            ) {
                                showMessage(
                                    screen,
                                    "This account is disabled."
                                );

                                screen.button.disabled =
                                    false;

                                return;
                            }

                            const devices =
                                Array.isArray(
                                    user.devices
                                )
                                    ? user.devices
                                    : [];

                            /*
                             * Same device
                             */
                            if (
                                devices.includes(
                                    deviceId
                                )
                            ) {

                                setUsername(
                                    user.username
                                );

                                closeAccessScreen(
                                    screen
                                );

                                resolve({
                                    allowed: true,
                                    status:
                                        "active",
                                    username:
                                        user.username,
                                    deviceId,
                                    toolId
                                });

                                return;
                            }

                            /*
                             * Existing user
                             * on different device
                             */
                            showMessage(
                                screen,
                                "This username already exists on another device. This device requires approval."
                            );

                            screen.button.disabled =
                                false;

                            return;
                        }

                        /*
                         * New user.
                         *
                         * In this GitHub-only
                         * version we cannot
                         * securely write the
                         * new record to GitHub
                         * from the browser.
                         */
                        showMessage(
                            screen,
                            "New registration needs to be connected to the PH10 registration system."
                        );

                        screen.button.disabled =
                            false;

                    } catch (error) {

                        console.error(
                            error
                        );

                        showMessage(
                            screen,
                            "PH10 access system error."
                        );

                        screen.button.disabled =
                            false;

                        reject(error);
                    }
                }

                screen.button.onclick =
                    submit;

                screen.input.onkeydown =
                    event => {
                        if (
                            event.key === "Enter"
                        ) {
                            submit();
                        }
                    };
            }
        );
    }

    window.PH10Access = {
        require,
        getDeviceId,
        getUsername
    };

})();
