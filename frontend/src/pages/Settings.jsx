import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Col,
  Container,
  Form,
  Image,
  Row,
  Spinner,
} from "react-bootstrap";
import toast from "react-hot-toast";

import { getMe, updateMe } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { useCurrency, CURRENCIES } from "../context/CurrencyContext";
import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "mk", label: "Македонски" },
];

const normalizeLang = (code) =>
  (code || "en").toLowerCase().startsWith("mk") ? "mk" : "en";

function InitialAvatar({ name, size = 120 }) {
  const initial = name?.[0]?.toUpperCase() || "?";
  return (
    <div
      className="d-inline-flex align-items-center justify-content-center rounded-circle bg-primary text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        fontWeight: 600,
      }}
    >
      {initial}
    </div>
  );
}

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { currency, setCurrency, currencies } = useCurrency();
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const [profile, setProfile] = useState(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [storeName, setStoreName] = useState("");
  const [language, setLanguage] = useState(normalizeLang(i18n.language));
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  const [errors, setErrors] = useState({});

  useEffect(() => {
    getMe()
      .then((data) => {
        setProfile(data);
        setUsername(data.username);
        setEmail(data.email || "");
        setStoreName(data.profile?.store_name || "");
        setLanguage(normalizeLang(i18n.language));
        setAvatarPreview(data.profile?.avatar || null);
      })
      .catch(() => toast.error(t("settings.failed_load_profile")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("settings.image_too_large"));
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    setErrors({});
    setSavingAccount(true);
    try {
      const updated = await updateMe({ username, email });
      setProfile(updated);
      toast.success(t("settings.account_updated"));
      refreshUser?.({ username: updated.username, email: updated.email });
    } catch (err) {
      const data = err.response?.data || {};
      const formatted = {};
      Object.keys(data).forEach((k) => {
        formatted[k] = Array.isArray(data[k]) ? data[k].join(" ") : data[k];
      });
      setErrors(formatted);
      if (!Object.keys(formatted).length) toast.error(t("settings.account_update_failed"));
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSaveAvatar = async () => {
    if (!avatarFile) {
      toast.error(t("settings.pick_image_first"));
      return;
    }
    setSavingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("profile.avatar", avatarFile);
      const updated = await updateMe(fd);
      setProfile(updated);
      setAvatarPreview(updated.profile?.avatar || null);
      setAvatarFile(null);
      toast.success(t("settings.avatar_updated"));
      refreshUser?.({ avatar: updated.profile?.avatar });
    } catch {
      toast.error(t("settings.avatar_upload_failed"));
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
  };

  const handleSavePreferences = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await updateMe({
        profile: {
          store_name: storeName,
          preferred_language: language,
          preferred_currency: currency,
        },
      });
      setProfile(updated);
      refreshUser?.({ store_name: updated.profile?.store_name || "" });
      i18n.changeLanguage(language);
      toast.success(t("settings.preferences_saved"));
    } catch {
      toast.error(t("settings.preferences_save_failed"));
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <Container className="text-center py-5">
        <Spinner animation="border" />
      </Container>
    );
  }

  return (
    <Container style={{ maxWidth: 800 }}>
      <h1 className="mb-4">{t("settings.title")}</h1>

      <Card className="mb-4">
        <Card.Body>
          <Card.Title>{t("settings.profile_picture")}</Card.Title>
          <Card.Subtitle className="text-muted small mb-3">
            {t("settings.profile_picture_hint")}
          </Card.Subtitle>
          <Row className="align-items-center">
            <Col xs="auto">
              {avatarPreview ? (
                <Image
                  src={avatarPreview}
                  roundedCircle
                  style={{ width: 120, height: 120, objectFit: "cover" }}
                />
              ) : (
                <InitialAvatar name={username} />
              )}
            </Col>
            <Col>
              <Form.Group className="mb-2">
                <Form.Control
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  size="sm"
                />
                <Form.Text className="text-muted">
                  {t("settings.image_format_hint")}
                </Form.Text>
              </Form.Group>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveAvatar}
                disabled={!avatarFile || savingAvatar}
              >
                {savingAvatar ? t("settings.uploading") : t("settings.upload_avatar")}
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Body>
          <Card.Title>{t("settings.profile")}</Card.Title>
          <Card.Subtitle className="text-muted small mb-3">
            {t("settings.account_subtitle")}
          </Card.Subtitle>
          <Form onSubmit={handleSaveAccount}>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>{t("settings.username")}</Form.Label>
                  <Form.Control
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    isInvalid={!!errors.username}
                    required
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.username}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>{t("settings.email")}</Form.Label>
                  <Form.Control
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    isInvalid={!!errors.email}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.email}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>
            <Button type="submit" variant="primary" disabled={savingAccount}>
              {savingAccount ? t("settings.saving") : t("settings.save_changes")}
            </Button>
          </Form>
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Body>
          <Card.Title>{t("settings.preferences")}</Card.Title>
          <Card.Subtitle className="text-muted small mb-3">
            {t("settings.preferences_subtitle")}
          </Card.Subtitle>
          <Form onSubmit={handleSavePreferences}>
            <Form.Group className="mb-3">
              <Form.Label>{t("settings.store_name")}</Form.Label>
              <Form.Control
                placeholder={t("settings.store_name_placeholder")}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                maxLength={100}
              />
              <Form.Text className="text-muted">
                {t("settings.store_name_hint")}
              </Form.Text>
            </Form.Group>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>{t("settings.language")}</Form.Label>
                  <Form.Select
                    value={language}
                    onChange={handleLanguageChange}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>{t("settings.currency")}</Form.Label>
                  <Form.Select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    {Object.values(currencies).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.symbol} {c.label}
                      </option>
                    ))}
                  </Form.Select>
                  <Form.Text className="text-muted">
                    {t("settings.currency_hint")}
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>
            <Button type="submit" variant="primary" disabled={savingProfile}>
              {savingProfile ? t("settings.saving") : t("settings.save_preferences")}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
}
