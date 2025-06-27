const axios = require('axios');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

const getHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
});

exports.createDnsRecord = async (apiToken, zoneId, type, name, content, proxied = true, ttl = 1) => {
    try {
        const response = await axios.post(
            `${CLOUDFLARE_API_BASE_URL}/zones/${zoneId}/dns_records`,
            { type, name, content, proxied, ttl },
            { headers: getHeaders(apiToken) }
        );
        return { success: true, data: response.data.result };
    } catch (error) {
        console.error('Cloudflare Create DNS Error:', error.response ? error.response.data : error.message);
        const cfError = error.response?.data?.errors?.[0]?.message || error.message || 'Failed to create DNS record';
        return { success: false, error: cfError };
    }
};

exports.listDnsRecords = async (apiToken, zoneId, params = {}) => {
    try {
        const response = await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${zoneId}/dns_records`, {
            headers: getHeaders(apiToken),
            params: params
        });
        return { success: true, data: response.data.result };
    } catch (error) {
        console.error('Cloudflare List DNS Error:', error.response ? error.response.data : error.message);
        const cfError = error.response?.data?.errors?.[0]?.message || error.message || 'Failed to list DNS records';
        return { success: false, error: cfError };
    }
};

exports.deleteDnsRecord = async (apiToken, zoneId, recordId) => {
    try {
        const response = await axios.delete(
            `${CLOUDFLARE_API_BASE_URL}/zones/${zoneId}/dns_records/${recordId}`,
            { headers: getHeaders(apiToken) }
        );
        return { success: true, data: response.data.result };
    } catch (error) {
        console.error('Cloudflare Delete DNS Error:', error.response ? error.response.data : error.message);
        const cfError = error.response?.data?.errors?.[0]?.message || error.message || 'Failed to delete DNS record';
        return { success: false, error: cfError };
    }
};