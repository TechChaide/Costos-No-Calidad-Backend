module.exports = ({ nc }, DataTypes) => {
    // Vista/cubo de solo lectura: no tiene llave primaria
    const CostoNoCalidad = nc.define('CostoNoCalidad', {

        anio: {
            type: DataTypes.INTEGER,
            field: 'AÑO'
        },

        mes: {
            type: DataTypes.INTEGER,
            field: 'MES'
        },

        centro: {
            type: DataTypes.STRING,
            field: 'CENTRO'
        },

        proceso: {
            type: DataTypes.STRING,
            field: 'PROCESO'
        },

        referencia: {
            type: DataTypes.STRING,
            field: 'REFERENCIA'
        },

        descripcion_referencia: {
            type: DataTypes.STRING,
            field: 'DESCRIPCION_REFERENCIA'
        },

        tipo_costos: {
            type: DataTypes.STRING,
            field: 'TIPO_COSTOS'
        },

        fuente: {
            type: DataTypes.STRING,
            field: 'FUENTE'
        },

        importe: {
            type: DataTypes.DECIMAL(18, 4),
            field: 'IMPORTE'
        }

    }, {
        tableName: 'CuboCostosNoCalidad',
        schema: 'dbo',
        timestamps: false
    });

    CostoNoCalidad.removeAttribute('id');

    return CostoNoCalidad;
};
