const axios = require('axios');

const LINODE_API_BASE_URL = 'https://api.linode.com/v4';

const getHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
});

exports.createVps = async (apiToken, { region, type, image, root_pass, label, tags = [], authorized_keys = [], backups_enabled = false, swap_size = 512, stackscript_id, stackscript_data }) => {
    if (!root_pass || root_pass.length < 10 || !/[A-Z]/.test(root_pass) || !/[a-z]/.test(root_pass) || !/[0-9]/.test(root_pass)) {
        return { success: false, error: 'Password harus minimal 10 karakter, mengandung huruf kapital, huruf kecil, dan angka.' };
    }
    try {
        const payload = {
            region,
            type,
            image,
            root_pass,
            label,
            tags,
            authorized_keys,
            backups_enabled,
            swap_size,
        };
        if (stackscript_id) payload.stackscript_id = stackscript_id;
        if (stackscript_data) payload.stackscript_data = stackscript_data;


        const response = await axios.post(
            `${LINODE_API_BASE_URL}/linodes/instances`,
            payload,
            { headers: getHeaders(apiToken) }
        );

        let linodeData = response.data;
        let retries = 0;
        const maxRetries = 12; // 12 * 10 detik = 2 menit

        while (linodeData.status !== 'running' && linodeData.ipv4 && linodeData.ipv4.length === 0 && retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            const statusResponse = await axios.get(`${LINODE_API_BASE_URL}/linodes/instances/${linodeData.id}`, { headers: getHeaders(apiToken) });
            linodeData = statusResponse.data;
            retries++;
        }
        
        if (linodeData.status === 'running' && linodeData.ipv4 && linodeData.ipv4.length > 0) {
            return { success: true, data: { ...linodeData, ip_address: linodeData.ipv4[0] } };
        } else if (retries >= maxRetries) {
            return { success: false, error: 'Timeout: VPS Linode tidak mendapatkan IP atau status running dalam 2 menit.', data: linodeData };
        } else {
            return { success: false, error: `VPS Linode dibuat tetapi status atau IP belum siap: ${linodeData.status}`, data: linodeData };
        }

    } catch (error) {
        console.error('Linode Create VPS Error:', error.response ? error.response.data : error.message);
        const linodeError = error.response?.data?.errors?.[0]?.reason || error.message || 'Failed to create Linode VPS';
        return { success: false, error: linodeError };
    }
};

exports.getVpsDetails = async (apiToken, linodeId) => {
    try {
        const response = await axios.get(`${LINODE_API_BASE_URL}/linodes/instances/${linodeId}`, {
            headers: getHeaders(apiToken),
        });
        return { success: true, data: response.data };
    } catch (error) {
        console.error('Linode Get VPS Error:', error.response ? error.response.data : error.message);
        return { success: false, error: error.response?.data?.errors?.[0]?.reason || 'Failed to get Linode VPS details' };
    }
};

exports.deleteVps = async (apiToken, linodeId) => {
    try {
        await axios.delete(`${LINODE_API_BASE_URL}/linodes/instances/${linodeId}`, {
            headers: getHeaders(apiToken),
        });
        return { success: true, message: `Linode instance ${linodeId} deleted.` };
    } catch (error) {
        console.error('Linode Delete VPS Error:', error.response ? error.response.data : error.message);
        return { success: false, error: error.response?.data?.errors?.[0]?.reason || 'Failed to delete Linode VPS' };
    }
};