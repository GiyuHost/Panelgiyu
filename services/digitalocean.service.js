const axios = require('axios');

const DO_API_BASE_URL = 'https://api.digitalocean.com/v2';

const getHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
});

exports.createDroplet = async (apiToken, { name, region, size, image, ssh_keys = [], backups = false, ipv6 = true, user_data = null, monitoring = false, volumes = [], tags = [], root_password }) => {
     if (!root_password || root_password.length < 10 || !/[A-Z]/.test(root_password) || !/[a-z]/.test(root_password) || !/[0-9]/.test(root_password)) {
        return { success: false, error: 'Password harus minimal 10 karakter, mengandung huruf kapital, huruf kecil, dan angka.' };
    }
    try {
        const payload = {
            name,
            region,
            size,
            image,
            ssh_keys,
            backups,
            ipv6,
            user_data,
            monitoring,
            volumes,
            tags,
        };
        
        const response = await axios.post(
            `${DO_API_BASE_URL}/droplets`,
            payload,
            { headers: getHeaders(apiToken) }
        );
        
        let dropletId = response.data.droplet.id;
        let dropletData = response.data.droplet;
        let retries = 0;
        const maxRetries = 18; // 18 * 10 detik = 3 menit

        while (dropletData.status !== 'active' && (!dropletData.networks || !dropletData.networks.v4 || dropletData.networks.v4.length === 0) && retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            const statusResponse = await axios.get(`${DO_API_BASE_URL}/droplets/${dropletId}`, { headers: getHeaders(apiToken) });
            dropletData = statusResponse.data.droplet;
            retries++;
        }

        if (dropletData.status === 'active' && dropletData.networks && dropletData.networks.v4 && dropletData.networks.v4.length > 0) {
            const ip_address = dropletData.networks.v4.find(net => net.type === 'public')?.ip_address;
            
            if (ip_address && root_password) {
                 await new Promise(resolve => setTimeout(resolve, 15000));
            }
            return { success: true, data: { ...dropletData, ip_address: ip_address || 'N/A' } };
        } else if (retries >= maxRetries) {
            return { success: false, error: 'Timeout: Droplet DigitalOcean tidak mendapatkan IP atau status active dalam 3 menit.', data: dropletData };
        } else {
             return { success: false, error: `Droplet DigitalOcean dibuat tetapi status atau IP belum siap: ${dropletData.status}`, data: dropletData };
        }

    } catch (error) {
        console.error('DigitalOcean Create Droplet Error:', error.response ? error.response.data : error.message);
        const doError = error.response?.data?.message || error.message || 'Failed to create DigitalOcean droplet';
        return { success: false, error: doError };
    }
};


exports.getDropletDetails = async (apiToken, dropletId) => {
    try {
        const response = await axios.get(`${DO_API_BASE_URL}/droplets/${dropletId}`, {
            headers: getHeaders(apiToken),
        });
        return { success: true, data: response.data.droplet };
    } catch (error) {
        console.error('DigitalOcean Get Droplet Error:', error.response ? error.response.data : error.message);
        return { success: false, error: error.response?.data?.message || 'Failed to get DigitalOcean droplet details' };
    }
};

exports.deleteDroplet = async (apiToken, dropletId) => {
    try {
        await axios.delete(`${DO_API_BASE_URL}/droplets/${dropletId}`, {
            headers: getHeaders(apiToken),
        });
        return { success: true, message: `DigitalOcean droplet ${dropletId} deleted.` };
    } catch (error) {
        console.error('DigitalOcean Delete Droplet Error:', error.response ? error.response.data : error.message);
        return { success: false, error: error.response?.data?.message || 'Failed to delete DigitalOcean droplet' };
    }
};