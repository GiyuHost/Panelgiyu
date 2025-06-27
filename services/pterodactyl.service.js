const axios = require('axios');

const getClientHeaders = (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
});

const getApplicationHeaders = (apiKey) => ({
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'Application/vnd.pterodactyl.v1+json',
    'Content-Type': 'application/json',
});

exports.findOrCreateUser = async (panelUrl, appApiKey, email, username, firstName, lastName, externalId = null) => {
    try {
        let existingUserResponse;
        try {
            existingUserResponse = await axios.get(
                `${panelUrl}/api/application/users?filter[email]=${encodeURIComponent(email)}`,
                { headers: getApplicationHeaders(appApiKey) }
            );
        } catch (searchError) {
             if (searchError.response && searchError.response.status !== 404) {
                console.error('Pterodactyl Find User Error (non-404):', searchError.response ? searchError.response.data : searchError.message);
             }
        }


        if (existingUserResponse && existingUserResponse.data && existingUserResponse.data.data && existingUserResponse.data.data.length > 0) {
            return { success: true, data: existingUserResponse.data.data[0].attributes };
        } else {
            const newUserPayload = {
                email: email,
                username: username || email.split('@')[0] + Math.floor(Math.random() * 1000),
                first_name: firstName || 'Giyu',
                last_name: lastName || 'User',
                password: Math.random().toString(36).slice(-12) + 'A1!',
                root_admin: false,
                language: 'en',
            };
            if (externalId) newUserPayload.external_id = externalId;

            const createUserResponse = await axios.post(
                `${panelUrl}/api/application/users`,
                newUserPayload,
                { headers: getApplicationHeaders(appApiKey) }
            );
            return { success: true, data: createUserResponse.data.attributes };
        }
    } catch (error) {
        console.error('Pterodactyl Find/Create User Error:', error.response ? error.response.data : error.message);
        const pteroError = error.response?.data?.errors?.[0]?.detail || error.message || 'Failed to find or create Pterodactyl user';
        return { success: false, error: pteroError };
    }
};


exports.createServer = async (panelUrl, appApiKey, serverDetails) => {
    try {
        let userId = serverDetails.user_id; 
        if (!userId && serverDetails.user) {
            const userResult = await this.findOrCreateUser(panelUrl, appApiKey, serverDetails.user, serverDetails.user.split('@')[0], 'User', 'Ptero');
            if (!userResult.success) {
                return { success: false, error: `Gagal mendapatkan user Pterodactyl: ${userResult.error}` };
            }
            userId = userResult.data.id;
        }
        if(!userId) {
            return { success: false, error: 'User ID Pterodactyl tidak ditemukan atau tidak bisa dibuat.' };
        }

        const payload = {
            name: serverDetails.name,
            user: userId, 
            egg: serverDetails.egg,
            docker_image: serverDetails.docker_image,
            startup: serverDetails.startup,
            limits: serverDetails.limits,
            feature_limits: serverDetails.feature_limits,
            environment: serverDetails.environment,
            deploy: serverDetails.deploy,
            start_on_completion: serverDetails.start_on_completion,
            skip_scripts: serverDetails.skip_scripts || false,
        };
        if(serverDetails.description) payload.description = serverDetails.description;
        if(serverDetails.external_id) payload.external_id = serverDetails.external_id;
        if(serverDetails.allocation_id) payload.allocation_id = serverDetails.allocation_id; // Jika ingin assign alokasi spesifik


        const response = await axios.post(
            `${panelUrl}/api/application/servers`,
            payload,
            { headers: getApplicationHeaders(appApiKey) }
        );
        return { success: true, data: response.data };
    } catch (error) {
        console.error('Pterodactyl Create Server Error:', error.response ? error.response.data.errors : error.message);
        const pteroError = error.response?.data?.errors?.[0]?.detail || error.message || 'Failed to create Pterodactyl server';
        return { success: false, error: pteroError, details: error.response?.data?.errors };
    }
};

exports.getServerDetails = async (panelUrl, appApiKey, serverId) => {
    try {
        const response = await axios.get(`${panelUrl}/api/application/servers/${serverId}`, {
            headers: getApplicationHeaders(appApiKey),
        });
        return { success: true, data: response.data.attributes };
    } catch (error) {
        console.error('Pterodactyl Get Server Details Error:', error.response ? error.response.data : error.message);
        return { success: false, error: error.response?.data?.errors?.[0]?.detail || 'Failed to get Pterodactyl server details' };
    }
};

exports.deleteServer = async (panelUrl, appApiKey, serverId, force = false) => {
    try {
        let url = `${panelUrl}/api/application/servers/${serverId}`;
        if (force) {
            url += '/force';
        }
        await axios.delete(url, {
            headers: getApplicationHeaders(appApiKey),
        });
        return { success: true, message: `Pterodactyl server ${serverId} deleted.` };
    } catch (error) {
        console.error('Pterodactyl Delete Server Error:', error.response ? error.response.data : error.message);
        return { success: false, error: error.response?.data?.errors?.[0]?.detail || 'Failed to delete Pterodactyl server' };
    }
};

exports.suspendServer = async (panelUrl, appApiKey, serverId) => {
    try {
        await axios.post(`${panelUrl}/api/application/servers/${serverId}/suspend`, {}, {
            headers: getApplicationHeaders(appApiKey),
        });
        return { success: true, message: `Pterodactyl server ${serverId} suspended.` };
    } catch (error) {
        console.error('Pterodactyl Suspend Server Error:', error.response ? error.response.data : error.message);
        return { success: false, error: error.response?.data?.errors?.[0]?.detail || 'Failed to suspend Pterodactyl server' };
    }
};

exports.unsuspendServer = async (panelUrl, appApiKey, serverId) => {
    try {
        await axios.post(`${panelUrl}/api/application/servers/${serverId}/unsuspend`, {}, {
            headers: getApplicationHeaders(appApiKey),
        });
        return { success: true, message: `Pterodactyl server ${serverId} unsuspended.` };
    } catch (error) {
        console.error('Pterodactyl Unsuspend Server Error:', error.response ? error.response.data : error.message);
        return { success: false, error: error.response?.data?.errors?.[0]?.detail || 'Failed to unsuspend Pterodactyl server' };
    }
};

exports.getClientServerPowerState = async (panelUrl, clientApiKey, serverIdentifier, signal) => {
    try {
        const response = await axios.post(
            `${panelUrl}/api/client/servers/${serverIdentifier}/power`,
            { signal },
            { headers: getClientHeaders(clientApiKey) }
        );
        return { success: true, message: `Signal ${signal} sent to server ${serverIdentifier}.` };
    } catch (error) {
        console.error('Pterodactyl Client Power State Error:', error.response ? error.response.data : error.message);
        return { success: false, error: error.response?.data?.errors?.[0]?.detail || `Failed to send signal ${signal}` };
    }
};