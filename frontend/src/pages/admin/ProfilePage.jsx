/**
 * Profile Page - User profile and account settings
 */

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authApi } from '../../api/auth';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { 
  IconUser, 
  IconLock, 
  IconMail, 
  IconPhone, 
  IconBuilding, 
  IconFileText,
  IconShieldCheck,
  IconBuildingBank
} from '@tabler/icons-react';

function ProfilePage() {
  const { user, institution } = useAuth();
  const { toast } = useToast();

  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setProfileLoading(true);

    try {
      await authApi.updateProfile(profileData);
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setPasswordLoading(true);

    try {
      await authApi.changePassword({ 
        currentPassword: passwordData.currentPassword, 
        newPassword: passwordData.newPassword 
      });
      toast.success('Password changed successfully');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const getRoleDisplayName = (role) => {
    const roleNames = {
      super_admin: 'Super Administrator',
      head_of_teaching_practice: 'Head of Teaching Practice',
      supervisor: 'Supervisor',
      field_monitor: 'Field Monitor',
      student: 'Student',
    };
    return roleNames[role] || role?.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">
          View and manage your account information
        </p>
      </div>

      {/* Profile Overview Card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            {/* Avatar */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white text-3xl sm:text-4xl font-bold border-4 border-white/30">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            
            {/* User Info */}
            <div className="text-center sm:text-left text-white">
              <h2 className="text-xl sm:text-2xl font-bold">{user?.name}</h2>
              <p className="text-primary-100 text-sm sm:text-base mt-1">{user?.email}</p>
              <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-xs sm:text-sm font-medium">
                  <IconShieldCheck className="w-4 h-4" />
                  {getRoleDisplayName(user?.role)}
                </span>
                {institution && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-xs sm:text-sm font-medium">
                    <IconBuilding className="w-4 h-4" />
                    {institution.code}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100 bg-gray-50">
          <div className="p-4 text-center">
            <div className="flex items-center justify-center w-10 h-10 mx-auto rounded-full bg-blue-100 text-blue-600 mb-2">
              <IconMail className="w-5 h-5" />
            </div>
            <p className="text-xs text-gray-500">Email</p>
            <p className="text-sm font-medium text-gray-900 truncate" title={user?.email}>
              {user?.email}
            </p>
          </div>
          <div className="p-4 text-center">
            <div className="flex items-center justify-center w-10 h-10 mx-auto rounded-full bg-green-100 text-green-600 mb-2">
              <IconPhone className="w-5 h-5" />
            </div>
            <p className="text-xs text-gray-500">Phone</p>
            <p className="text-sm font-medium text-gray-900">
              {user?.phone || 'Not set'}
            </p>
          </div>
          <div className="p-4 text-center">
            <div className="flex items-center justify-center w-10 h-10 mx-auto rounded-full bg-purple-100 text-purple-600 mb-2">
              <IconFileText className="w-5 h-5" />
            </div>
            <p className="text-xs text-gray-500">File Number</p>
            <p className="text-sm font-medium text-gray-900">
              {user?.file_number || 'Not set'}
            </p>
          </div>
          <div className="p-4 text-center">
            <div className="flex items-center justify-center w-10 h-10 mx-auto rounded-full bg-orange-100 text-orange-600 mb-2">
              <IconBuildingBank className="w-5 h-5" />
            </div>
            <p className="text-xs text-gray-500">Faculty</p>
            <p className="text-sm font-medium text-gray-900">
              {user?.faculty || 'Not assigned'}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Edit Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary-100 text-primary-600">
                <IconUser className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Edit Profile</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Update your personal information</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <Input
                label="Full Name"
                value={profileData.name}
                onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                required
                placeholder="Enter your full name"
              />
              <Input
                label="Email Address"
                value={user?.email}
                disabled
                className="bg-gray-50"
                helperText="Email cannot be changed"
              />
              <Input
                label="Phone Number"
                value={profileData.phone}
                onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                placeholder="Enter your phone number"
              />
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  loading={profileLoading} 
                  className="w-full sm:w-auto"
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                <IconLock className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Change Password</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Secure your account with a new password</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <Input
                type="password"
                label="Current Password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                required
                placeholder="Enter current password"
              />
              <Input
                type="password"
                label="New Password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                required
                placeholder="Enter new password"
                helperText="Minimum 8 characters"
              />
              <Input
                type="password"
                label="Confirm New Password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                required
                placeholder="Confirm new password"
              />
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  loading={passwordLoading}
                  variant="secondary"
                  className="w-full sm:w-auto"
                >
                  Update Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Institution Info */}
      {institution && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                <IconBuilding className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Institution Details</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Your affiliated institution</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-gray-50">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Institution Name</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{institution.name}</p>
              </div>
              <div className="p-4 rounded-lg bg-gray-50">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Institution Code</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{institution.code}</p>
              </div>
              <div className="p-4 rounded-lg bg-gray-50">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Subdomain</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{institution.subdomain || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ProfilePage;
