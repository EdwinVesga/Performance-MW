/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 415.0, "minX": 0.0, "maxY": 17405.0, "series": [{"data": [[0.0, 415.0], [0.1, 582.0], [0.2, 637.0], [0.3, 652.0], [0.4, 659.0], [0.5, 681.0], [0.6, 686.0], [0.7, 701.0], [0.8, 719.0], [0.9, 735.0], [1.0, 776.0], [1.1, 817.0], [1.2, 846.0], [1.3, 860.0], [1.4, 908.0], [1.5, 933.0], [1.6, 951.0], [1.7, 981.0], [1.8, 1003.0], [1.9, 1048.0], [2.0, 1172.0], [2.1, 1526.0], [2.2, 1774.0], [2.3, 1828.0], [2.4, 1880.0], [2.5, 1889.0], [2.6, 1946.0], [2.7, 2002.0], [2.8, 2024.0], [2.9, 2055.0], [3.0, 2083.0], [3.1, 2151.0], [3.2, 2258.0], [3.3, 2321.0], [3.4, 2410.0], [3.5, 2463.0], [3.6, 2476.0], [3.7, 2490.0], [3.8, 2530.0], [3.9, 2560.0], [4.0, 2632.0], [4.1, 2640.0], [4.2, 2699.0], [4.3, 2718.0], [4.4, 2750.0], [4.5, 2784.0], [4.6, 2835.0], [4.7, 2880.0], [4.8, 2988.0], [4.9, 3046.0], [5.0, 3104.0], [5.1, 3146.0], [5.2, 3179.0], [5.3, 3189.0], [5.4, 3209.0], [5.5, 3237.0], [5.6, 3238.0], [5.7, 3261.0], [5.8, 3293.0], [5.9, 3318.0], [6.0, 3333.0], [6.1, 3365.0], [6.2, 3372.0], [6.3, 3405.0], [6.4, 3410.0], [6.5, 3425.0], [6.6, 3488.0], [6.7, 3508.0], [6.8, 3534.0], [6.9, 3544.0], [7.0, 3569.0], [7.1, 3601.0], [7.2, 3612.0], [7.3, 3627.0], [7.4, 3637.0], [7.5, 3656.0], [7.6, 3659.0], [7.7, 3673.0], [7.8, 3684.0], [7.9, 3706.0], [8.0, 3716.0], [8.1, 3730.0], [8.2, 3738.0], [8.3, 3747.0], [8.4, 3758.0], [8.5, 3759.0], [8.6, 3792.0], [8.7, 3803.0], [8.8, 3809.0], [8.9, 3821.0], [9.0, 3829.0], [9.1, 3829.0], [9.2, 3833.0], [9.3, 3841.0], [9.4, 3846.0], [9.5, 3849.0], [9.6, 3859.0], [9.7, 3867.0], [9.8, 3905.0], [9.9, 3916.0], [10.0, 3924.0], [10.1, 3933.0], [10.2, 3951.0], [10.3, 3960.0], [10.4, 3961.0], [10.5, 3965.0], [10.6, 3977.0], [10.7, 3986.0], [10.8, 3998.0], [10.9, 4003.0], [11.0, 4009.0], [11.1, 4026.0], [11.2, 4035.0], [11.3, 4045.0], [11.4, 4056.0], [11.5, 4059.0], [11.6, 4084.0], [11.7, 4090.0], [11.8, 4097.0], [11.9, 4105.0], [12.0, 4108.0], [12.1, 4128.0], [12.2, 4134.0], [12.3, 4142.0], [12.4, 4152.0], [12.5, 4162.0], [12.6, 4165.0], [12.7, 4176.0], [12.8, 4180.0], [12.9, 4203.0], [13.0, 4220.0], [13.1, 4230.0], [13.2, 4252.0], [13.3, 4277.0], [13.4, 4285.0], [13.5, 4301.0], [13.6, 4307.0], [13.7, 4309.0], [13.8, 4312.0], [13.9, 4318.0], [14.0, 4329.0], [14.1, 4337.0], [14.2, 4345.0], [14.3, 4380.0], [14.4, 4387.0], [14.5, 4394.0], [14.6, 4406.0], [14.7, 4416.0], [14.8, 4435.0], [14.9, 4456.0], [15.0, 4467.0], [15.1, 4477.0], [15.2, 4486.0], [15.3, 4503.0], [15.4, 4524.0], [15.5, 4525.0], [15.6, 4537.0], [15.7, 4553.0], [15.8, 4554.0], [15.9, 4571.0], [16.0, 4577.0], [16.1, 4609.0], [16.2, 4615.0], [16.3, 4626.0], [16.4, 4636.0], [16.5, 4640.0], [16.6, 4654.0], [16.7, 4660.0], [16.8, 4665.0], [16.9, 4674.0], [17.0, 4692.0], [17.1, 4706.0], [17.2, 4713.0], [17.3, 4718.0], [17.4, 4718.0], [17.5, 4747.0], [17.6, 4758.0], [17.7, 4775.0], [17.8, 4776.0], [17.9, 4782.0], [18.0, 4785.0], [18.1, 4797.0], [18.2, 4810.0], [18.3, 4829.0], [18.4, 4833.0], [18.5, 4843.0], [18.6, 4847.0], [18.7, 4856.0], [18.8, 4865.0], [18.9, 4890.0], [19.0, 4909.0], [19.1, 4945.0], [19.2, 4969.0], [19.3, 4980.0], [19.4, 5009.0], [19.5, 5027.0], [19.6, 5041.0], [19.7, 5059.0], [19.8, 5073.0], [19.9, 5081.0], [20.0, 5091.0], [20.1, 5105.0], [20.2, 5124.0], [20.3, 5140.0], [20.4, 5143.0], [20.5, 5179.0], [20.6, 5233.0], [20.7, 5264.0], [20.8, 5279.0], [20.9, 5282.0], [21.0, 5287.0], [21.1, 5326.0], [21.2, 5342.0], [21.3, 5356.0], [21.4, 5374.0], [21.5, 5385.0], [21.6, 5396.0], [21.7, 5417.0], [21.8, 5425.0], [21.9, 5431.0], [22.0, 5444.0], [22.1, 5464.0], [22.2, 5469.0], [22.3, 5492.0], [22.4, 5502.0], [22.5, 5537.0], [22.6, 5564.0], [22.7, 5580.0], [22.8, 5597.0], [22.9, 5610.0], [23.0, 5615.0], [23.1, 5623.0], [23.2, 5630.0], [23.3, 5643.0], [23.4, 5655.0], [23.5, 5656.0], [23.6, 5667.0], [23.7, 5671.0], [23.8, 5685.0], [23.9, 5689.0], [24.0, 5695.0], [24.1, 5711.0], [24.2, 5720.0], [24.3, 5730.0], [24.4, 5739.0], [24.5, 5747.0], [24.6, 5752.0], [24.7, 5772.0], [24.8, 5781.0], [24.9, 5796.0], [25.0, 5798.0], [25.1, 5802.0], [25.2, 5823.0], [25.3, 5835.0], [25.4, 5863.0], [25.5, 5884.0], [25.6, 5887.0], [25.7, 5891.0], [25.8, 5903.0], [25.9, 5922.0], [26.0, 5938.0], [26.1, 5939.0], [26.2, 5949.0], [26.3, 5967.0], [26.4, 5993.0], [26.5, 6001.0], [26.6, 6024.0], [26.7, 6028.0], [26.8, 6030.0], [26.9, 6045.0], [27.0, 6055.0], [27.1, 6084.0], [27.2, 6100.0], [27.3, 6117.0], [27.4, 6130.0], [27.5, 6140.0], [27.6, 6154.0], [27.7, 6176.0], [27.8, 6191.0], [27.9, 6231.0], [28.0, 6245.0], [28.1, 6269.0], [28.2, 6301.0], [28.3, 6315.0], [28.4, 6319.0], [28.5, 6356.0], [28.6, 6361.0], [28.7, 6365.0], [28.8, 6372.0], [28.9, 6392.0], [29.0, 6400.0], [29.1, 6408.0], [29.2, 6414.0], [29.3, 6421.0], [29.4, 6438.0], [29.5, 6443.0], [29.6, 6451.0], [29.7, 6458.0], [29.8, 6462.0], [29.9, 6484.0], [30.0, 6498.0], [30.1, 6503.0], [30.2, 6527.0], [30.3, 6536.0], [30.4, 6560.0], [30.5, 6573.0], [30.6, 6578.0], [30.7, 6585.0], [30.8, 6607.0], [30.9, 6633.0], [31.0, 6645.0], [31.1, 6674.0], [31.2, 6678.0], [31.3, 6688.0], [31.4, 6706.0], [31.5, 6710.0], [31.6, 6729.0], [31.7, 6770.0], [31.8, 6778.0], [31.9, 6790.0], [32.0, 6824.0], [32.1, 6836.0], [32.2, 6842.0], [32.3, 6851.0], [32.4, 6857.0], [32.5, 6874.0], [32.6, 6893.0], [32.7, 6909.0], [32.8, 6939.0], [32.9, 6953.0], [33.0, 6963.0], [33.1, 6975.0], [33.2, 6988.0], [33.3, 6993.0], [33.4, 7011.0], [33.5, 7022.0], [33.6, 7046.0], [33.7, 7048.0], [33.8, 7059.0], [33.9, 7069.0], [34.0, 7071.0], [34.1, 7085.0], [34.2, 7099.0], [34.3, 7146.0], [34.4, 7160.0], [34.5, 7185.0], [34.6, 7196.0], [34.7, 7201.0], [34.8, 7213.0], [34.9, 7234.0], [35.0, 7235.0], [35.1, 7238.0], [35.2, 7255.0], [35.3, 7260.0], [35.4, 7276.0], [35.5, 7290.0], [35.6, 7298.0], [35.7, 7303.0], [35.8, 7319.0], [35.9, 7331.0], [36.0, 7338.0], [36.1, 7345.0], [36.2, 7355.0], [36.3, 7362.0], [36.4, 7386.0], [36.5, 7391.0], [36.6, 7393.0], [36.7, 7423.0], [36.8, 7425.0], [36.9, 7441.0], [37.0, 7447.0], [37.1, 7449.0], [37.2, 7459.0], [37.3, 7474.0], [37.4, 7487.0], [37.5, 7490.0], [37.6, 7493.0], [37.7, 7502.0], [37.8, 7520.0], [37.9, 7524.0], [38.0, 7539.0], [38.1, 7561.0], [38.2, 7565.0], [38.3, 7574.0], [38.4, 7586.0], [38.5, 7590.0], [38.6, 7599.0], [38.7, 7609.0], [38.8, 7637.0], [38.9, 7655.0], [39.0, 7670.0], [39.1, 7688.0], [39.2, 7690.0], [39.3, 7693.0], [39.4, 7706.0], [39.5, 7726.0], [39.6, 7741.0], [39.7, 7745.0], [39.8, 7758.0], [39.9, 7774.0], [40.0, 7777.0], [40.1, 7781.0], [40.2, 7800.0], [40.3, 7801.0], [40.4, 7810.0], [40.5, 7817.0], [40.6, 7851.0], [40.7, 7852.0], [40.8, 7861.0], [40.9, 7868.0], [41.0, 7881.0], [41.1, 7892.0], [41.2, 7904.0], [41.3, 7916.0], [41.4, 7922.0], [41.5, 7950.0], [41.6, 7967.0], [41.7, 7980.0], [41.8, 7987.0], [41.9, 7995.0], [42.0, 7997.0], [42.1, 8003.0], [42.2, 8007.0], [42.3, 8013.0], [42.4, 8015.0], [42.5, 8040.0], [42.6, 8052.0], [42.7, 8062.0], [42.8, 8063.0], [42.9, 8073.0], [43.0, 8079.0], [43.1, 8099.0], [43.2, 8114.0], [43.3, 8123.0], [43.4, 8124.0], [43.5, 8132.0], [43.6, 8145.0], [43.7, 8163.0], [43.8, 8167.0], [43.9, 8202.0], [44.0, 8217.0], [44.1, 8227.0], [44.2, 8244.0], [44.3, 8247.0], [44.4, 8249.0], [44.5, 8254.0], [44.6, 8265.0], [44.7, 8288.0], [44.8, 8309.0], [44.9, 8317.0], [45.0, 8325.0], [45.1, 8334.0], [45.2, 8354.0], [45.3, 8366.0], [45.4, 8386.0], [45.5, 8403.0], [45.6, 8431.0], [45.7, 8447.0], [45.8, 8449.0], [45.9, 8449.0], [46.0, 8463.0], [46.1, 8465.0], [46.2, 8468.0], [46.3, 8473.0], [46.4, 8496.0], [46.5, 8507.0], [46.6, 8522.0], [46.7, 8535.0], [46.8, 8562.0], [46.9, 8568.0], [47.0, 8575.0], [47.1, 8585.0], [47.2, 8604.0], [47.3, 8627.0], [47.4, 8638.0], [47.5, 8652.0], [47.6, 8665.0], [47.7, 8684.0], [47.8, 8695.0], [47.9, 8701.0], [48.0, 8719.0], [48.1, 8738.0], [48.2, 8760.0], [48.3, 8830.0], [48.4, 8846.0], [48.5, 8854.0], [48.6, 8877.0], [48.7, 8878.0], [48.8, 8891.0], [48.9, 8899.0], [49.0, 8910.0], [49.1, 8943.0], [49.2, 8965.0], [49.3, 8973.0], [49.4, 8980.0], [49.5, 8994.0], [49.6, 8998.0], [49.7, 9022.0], [49.8, 9033.0], [49.9, 9044.0], [50.0, 9069.0], [50.1, 9073.0], [50.2, 9096.0], [50.3, 9110.0], [50.4, 9119.0], [50.5, 9129.0], [50.6, 9163.0], [50.7, 9166.0], [50.8, 9178.0], [50.9, 9201.0], [51.0, 9232.0], [51.1, 9256.0], [51.2, 9262.0], [51.3, 9284.0], [51.4, 9297.0], [51.5, 9325.0], [51.6, 9326.0], [51.7, 9362.0], [51.8, 9366.0], [51.9, 9401.0], [52.0, 9428.0], [52.1, 9438.0], [52.2, 9451.0], [52.3, 9457.0], [52.4, 9464.0], [52.5, 9471.0], [52.6, 9478.0], [52.7, 9481.0], [52.8, 9486.0], [52.9, 9500.0], [53.0, 9522.0], [53.1, 9542.0], [53.2, 9543.0], [53.3, 9554.0], [53.4, 9557.0], [53.5, 9568.0], [53.6, 9581.0], [53.7, 9591.0], [53.8, 9630.0], [53.9, 9635.0], [54.0, 9638.0], [54.1, 9656.0], [54.2, 9658.0], [54.3, 9671.0], [54.4, 9684.0], [54.5, 9728.0], [54.6, 9738.0], [54.7, 9776.0], [54.8, 9791.0], [54.9, 9803.0], [55.0, 9814.0], [55.1, 9869.0], [55.2, 9890.0], [55.3, 9916.0], [55.4, 9933.0], [55.5, 9969.0], [55.6, 9978.0], [55.7, 10049.0], [55.8, 10069.0], [55.9, 10072.0], [56.0, 10145.0], [56.1, 10174.0], [56.2, 10180.0], [56.3, 10200.0], [56.4, 10208.0], [56.5, 10223.0], [56.6, 10245.0], [56.7, 10271.0], [56.8, 10317.0], [56.9, 10329.0], [57.0, 10372.0], [57.1, 10419.0], [57.2, 10441.0], [57.3, 10471.0], [57.4, 10479.0], [57.5, 10485.0], [57.6, 10512.0], [57.7, 10533.0], [57.8, 10542.0], [57.9, 10558.0], [58.0, 10621.0], [58.1, 10636.0], [58.2, 10685.0], [58.3, 10697.0], [58.4, 10734.0], [58.5, 10761.0], [58.6, 10764.0], [58.7, 10793.0], [58.8, 10828.0], [58.9, 10851.0], [59.0, 10875.0], [59.1, 10885.0], [59.2, 10891.0], [59.3, 10913.0], [59.4, 10920.0], [59.5, 10923.0], [59.6, 10931.0], [59.7, 10939.0], [59.8, 10965.0], [59.9, 10981.0], [60.0, 11035.0], [60.1, 11086.0], [60.2, 11125.0], [60.3, 11163.0], [60.4, 11184.0], [60.5, 11212.0], [60.6, 11228.0], [60.7, 11238.0], [60.8, 11272.0], [60.9, 11277.0], [61.0, 11292.0], [61.1, 11317.0], [61.2, 11347.0], [61.3, 11355.0], [61.4, 11365.0], [61.5, 11415.0], [61.6, 11418.0], [61.7, 11441.0], [61.8, 11464.0], [61.9, 11516.0], [62.0, 11535.0], [62.1, 11559.0], [62.2, 11568.0], [62.3, 11576.0], [62.4, 11596.0], [62.5, 11608.0], [62.6, 11639.0], [62.7, 11681.0], [62.8, 11689.0], [62.9, 11737.0], [63.0, 11799.0], [63.1, 11832.0], [63.2, 11838.0], [63.3, 11847.0], [63.4, 11850.0], [63.5, 11866.0], [63.6, 11893.0], [63.7, 11929.0], [63.8, 11969.0], [63.9, 11977.0], [64.0, 11990.0], [64.1, 11998.0], [64.2, 12000.0], [64.3, 12010.0], [64.4, 12034.0], [64.5, 12036.0], [64.6, 12041.0], [64.7, 12067.0], [64.8, 12084.0], [64.9, 12090.0], [65.0, 12116.0], [65.1, 12130.0], [65.2, 12167.0], [65.3, 12217.0], [65.4, 12229.0], [65.5, 12252.0], [65.6, 12258.0], [65.7, 12267.0], [65.8, 12275.0], [65.9, 12277.0], [66.0, 12281.0], [66.1, 12313.0], [66.2, 12330.0], [66.3, 12342.0], [66.4, 12360.0], [66.5, 12366.0], [66.6, 12379.0], [66.7, 12397.0], [66.8, 12403.0], [66.9, 12415.0], [67.0, 12427.0], [67.1, 12438.0], [67.2, 12468.0], [67.3, 12475.0], [67.4, 12479.0], [67.5, 12500.0], [67.6, 12506.0], [67.7, 12516.0], [67.8, 12549.0], [67.9, 12553.0], [68.0, 12566.0], [68.1, 12571.0], [68.2, 12585.0], [68.3, 12589.0], [68.4, 12598.0], [68.5, 12627.0], [68.6, 12680.0], [68.7, 12684.0], [68.8, 12688.0], [68.9, 12692.0], [69.0, 12713.0], [69.1, 12716.0], [69.2, 12738.0], [69.3, 12762.0], [69.4, 12766.0], [69.5, 12772.0], [69.6, 12776.0], [69.7, 12782.0], [69.8, 12785.0], [69.9, 12787.0], [70.0, 12812.0], [70.1, 12818.0], [70.2, 12865.0], [70.3, 12890.0], [70.4, 12903.0], [70.5, 12939.0], [70.6, 12943.0], [70.7, 12951.0], [70.8, 12964.0], [70.9, 12977.0], [71.0, 12982.0], [71.1, 13001.0], [71.2, 13014.0], [71.3, 13017.0], [71.4, 13030.0], [71.5, 13042.0], [71.6, 13048.0], [71.7, 13048.0], [71.8, 13075.0], [71.9, 13091.0], [72.0, 13098.0], [72.1, 13105.0], [72.2, 13112.0], [72.3, 13143.0], [72.4, 13159.0], [72.5, 13168.0], [72.6, 13180.0], [72.7, 13208.0], [72.8, 13213.0], [72.9, 13228.0], [73.0, 13236.0], [73.1, 13238.0], [73.2, 13248.0], [73.3, 13254.0], [73.4, 13259.0], [73.5, 13267.0], [73.6, 13290.0], [73.7, 13314.0], [73.8, 13336.0], [73.9, 13369.0], [74.0, 13392.0], [74.1, 13397.0], [74.2, 13399.0], [74.3, 13400.0], [74.4, 13403.0], [74.5, 13411.0], [74.6, 13426.0], [74.7, 13434.0], [74.8, 13439.0], [74.9, 13472.0], [75.0, 13486.0], [75.1, 13499.0], [75.2, 13506.0], [75.3, 13514.0], [75.4, 13535.0], [75.5, 13548.0], [75.6, 13573.0], [75.7, 13587.0], [75.8, 13595.0], [75.9, 13627.0], [76.0, 13630.0], [76.1, 13647.0], [76.2, 13660.0], [76.3, 13667.0], [76.4, 13685.0], [76.5, 13703.0], [76.6, 13712.0], [76.7, 13717.0], [76.8, 13722.0], [76.9, 13727.0], [77.0, 13735.0], [77.1, 13738.0], [77.2, 13742.0], [77.3, 13753.0], [77.4, 13769.0], [77.5, 13777.0], [77.6, 13780.0], [77.7, 13789.0], [77.8, 13790.0], [77.9, 13799.0], [78.0, 13807.0], [78.1, 13818.0], [78.2, 13825.0], [78.3, 13837.0], [78.4, 13842.0], [78.5, 13855.0], [78.6, 13867.0], [78.7, 13872.0], [78.8, 13889.0], [78.9, 13890.0], [79.0, 13905.0], [79.1, 13912.0], [79.2, 13914.0], [79.3, 13920.0], [79.4, 13925.0], [79.5, 13927.0], [79.6, 13933.0], [79.7, 13938.0], [79.8, 13942.0], [79.9, 13956.0], [80.0, 13965.0], [80.1, 13966.0], [80.2, 13971.0], [80.3, 13983.0], [80.4, 13991.0], [80.5, 13996.0], [80.6, 14001.0], [80.7, 14004.0], [80.8, 14009.0], [80.9, 14015.0], [81.0, 14022.0], [81.1, 14026.0], [81.2, 14032.0], [81.3, 14038.0], [81.4, 14039.0], [81.5, 14043.0], [81.6, 14048.0], [81.7, 14068.0], [81.8, 14070.0], [81.9, 14076.0], [82.0, 14087.0], [82.1, 14093.0], [82.2, 14096.0], [82.3, 14097.0], [82.4, 14100.0], [82.5, 14107.0], [82.6, 14109.0], [82.7, 14120.0], [82.8, 14131.0], [82.9, 14133.0], [83.0, 14140.0], [83.1, 14145.0], [83.2, 14154.0], [83.3, 14173.0], [83.4, 14174.0], [83.5, 14187.0], [83.6, 14191.0], [83.7, 14192.0], [83.8, 14195.0], [83.9, 14201.0], [84.0, 14205.0], [84.1, 14214.0], [84.2, 14217.0], [84.3, 14226.0], [84.4, 14231.0], [84.5, 14234.0], [84.6, 14235.0], [84.7, 14245.0], [84.8, 14246.0], [84.9, 14254.0], [85.0, 14261.0], [85.1, 14267.0], [85.2, 14280.0], [85.3, 14292.0], [85.4, 14294.0], [85.5, 14301.0], [85.6, 14306.0], [85.7, 14310.0], [85.8, 14319.0], [85.9, 14321.0], [86.0, 14326.0], [86.1, 14329.0], [86.2, 14332.0], [86.3, 14334.0], [86.4, 14338.0], [86.5, 14347.0], [86.6, 14358.0], [86.7, 14365.0], [86.8, 14366.0], [86.9, 14377.0], [87.0, 14389.0], [87.1, 14398.0], [87.2, 14402.0], [87.3, 14408.0], [87.4, 14409.0], [87.5, 14410.0], [87.6, 14424.0], [87.7, 14426.0], [87.8, 14427.0], [87.9, 14432.0], [88.0, 14450.0], [88.1, 14450.0], [88.2, 14485.0], [88.3, 14491.0], [88.4, 14498.0], [88.5, 14505.0], [88.6, 14514.0], [88.7, 14516.0], [88.8, 14519.0], [88.9, 14524.0], [89.0, 14531.0], [89.1, 14536.0], [89.2, 14542.0], [89.3, 14548.0], [89.4, 14560.0], [89.5, 14561.0], [89.6, 14562.0], [89.7, 14567.0], [89.8, 14572.0], [89.9, 14576.0], [90.0, 14577.0], [90.1, 14583.0], [90.2, 14590.0], [90.3, 14594.0], [90.4, 14598.0], [90.5, 14603.0], [90.6, 14616.0], [90.7, 14623.0], [90.8, 14636.0], [90.9, 14643.0], [91.0, 14656.0], [91.1, 14660.0], [91.2, 14662.0], [91.3, 14673.0], [91.4, 14680.0], [91.5, 14689.0], [91.6, 14698.0], [91.7, 14702.0], [91.8, 14708.0], [91.9, 14716.0], [92.0, 14723.0], [92.1, 14738.0], [92.2, 14744.0], [92.3, 14748.0], [92.4, 14755.0], [92.5, 14759.0], [92.6, 14771.0], [92.7, 14778.0], [92.8, 14783.0], [92.9, 14784.0], [93.0, 14784.0], [93.1, 14801.0], [93.2, 14821.0], [93.3, 14833.0], [93.4, 14840.0], [93.5, 14850.0], [93.6, 14862.0], [93.7, 14865.0], [93.8, 14868.0], [93.9, 14878.0], [94.0, 14884.0], [94.1, 14895.0], [94.2, 14912.0], [94.3, 14915.0], [94.4, 14947.0], [94.5, 14967.0], [94.6, 14980.0], [94.7, 14982.0], [94.8, 15003.0], [94.9, 15007.0], [95.0, 15024.0], [95.1, 15035.0], [95.2, 15052.0], [95.3, 15065.0], [95.4, 15070.0], [95.5, 15087.0], [95.6, 15101.0], [95.7, 15109.0], [95.8, 15126.0], [95.9, 15132.0], [96.0, 15150.0], [96.1, 15158.0], [96.2, 15162.0], [96.3, 15174.0], [96.4, 15187.0], [96.5, 15222.0], [96.6, 15233.0], [96.7, 15244.0], [96.8, 15261.0], [96.9, 15266.0], [97.0, 15281.0], [97.1, 15288.0], [97.2, 15290.0], [97.3, 15315.0], [97.4, 15328.0], [97.5, 15333.0], [97.6, 15340.0], [97.7, 15360.0], [97.8, 15415.0], [97.9, 15420.0], [98.0, 15423.0], [98.1, 15455.0], [98.2, 15459.0], [98.3, 15531.0], [98.4, 15557.0], [98.5, 15566.0], [98.6, 15574.0], [98.7, 15600.0], [98.8, 15638.0], [98.9, 15689.0], [99.0, 15729.0], [99.1, 15746.0], [99.2, 15769.0], [99.3, 15884.0], [99.4, 16235.0], [99.5, 16409.0], [99.6, 16435.0], [99.7, 16671.0], [99.8, 17187.0], [99.9, 17248.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 400.0, "maxY": 39.0, "series": [{"data": [[400.0, 1.0], [500.0, 2.0], [600.0, 10.0], [700.0, 8.0], [800.0, 6.0], [900.0, 8.0], [1000.0, 4.0], [1100.0, 2.0], [1500.0, 1.0], [1600.0, 2.0], [1700.0, 2.0], [1800.0, 5.0], [1900.0, 3.0], [2000.0, 7.0], [2100.0, 2.0], [2200.0, 3.0], [2300.0, 1.0], [2400.0, 8.0], [2500.0, 4.0], [2600.0, 6.0], [2700.0, 6.0], [2800.0, 5.0], [2900.0, 1.0], [3000.0, 3.0], [3100.0, 7.0], [3200.0, 10.0], [3300.0, 9.0], [3400.0, 8.0], [3500.0, 8.0], [3700.0, 16.0], [3600.0, 16.0], [3800.0, 22.0], [3900.0, 21.0], [4000.0, 19.0], [4100.0, 21.0], [4200.0, 12.0], [4300.0, 22.0], [4500.0, 16.0], [4400.0, 14.0], [4600.0, 20.0], [4700.0, 21.0], [4800.0, 16.0], [5000.0, 15.0], [4900.0, 8.0], [5100.0, 9.0], [5200.0, 10.0], [5300.0, 12.0], [5400.0, 15.0], [5500.0, 10.0], [5600.0, 24.0], [5700.0, 20.0], [5800.0, 13.0], [6000.0, 14.0], [5900.0, 15.0], [6100.0, 13.0], [6300.0, 15.0], [6200.0, 7.0], [6400.0, 23.0], [6600.0, 12.0], [6500.0, 14.0], [6800.0, 15.0], [6700.0, 11.0], [6900.0, 13.0], [7000.0, 18.0], [7100.0, 8.0], [7200.0, 20.0], [7400.0, 20.0], [7300.0, 20.0], [7500.0, 21.0], [7600.0, 15.0], [7700.0, 16.0], [7900.0, 18.0], [7800.0, 19.0], [8000.0, 22.0], [8100.0, 15.0], [8200.0, 17.0], [8400.0, 21.0], [8300.0, 14.0], [8500.0, 14.0], [8600.0, 14.0], [8700.0, 8.0], [8800.0, 13.0], [8900.0, 14.0], [9000.0, 12.0], [9100.0, 13.0], [9200.0, 11.0], [9400.0, 20.0], [9300.0, 9.0], [9500.0, 17.0], [9700.0, 9.0], [9600.0, 14.0], [9900.0, 8.0], [10100.0, 6.0], [10000.0, 7.0], [9800.0, 7.0], [10200.0, 10.0], [10400.0, 10.0], [10700.0, 8.0], [10300.0, 6.0], [10500.0, 8.0], [10600.0, 7.0], [10900.0, 14.0], [11000.0, 4.0], [11200.0, 12.0], [10800.0, 10.0], [11100.0, 7.0], [11300.0, 8.0], [11400.0, 7.0], [11500.0, 13.0], [11700.0, 4.0], [11600.0, 7.0], [12000.0, 15.0], [11800.0, 12.0], [11900.0, 11.0], [12200.0, 17.0], [12100.0, 6.0], [12600.0, 10.0], [12700.0, 20.0], [12300.0, 13.0], [12500.0, 19.0], [12400.0, 15.0], [12900.0, 15.0], [13000.0, 19.0], [13100.0, 12.0], [13300.0, 11.0], [12800.0, 8.0], [13200.0, 21.0], [13700.0, 29.0], [13500.0, 14.0], [13400.0, 18.0], [13800.0, 20.0], [13600.0, 13.0], [13900.0, 33.0], [14000.0, 36.0], [14100.0, 30.0], [14300.0, 34.0], [14200.0, 32.0], [14500.0, 39.0], [14400.0, 26.0], [14700.0, 29.0], [14800.0, 21.0], [14600.0, 24.0], [15000.0, 16.0], [14900.0, 13.0], [15100.0, 17.0], [15200.0, 16.0], [15300.0, 10.0], [15700.0, 7.0], [15600.0, 5.0], [15400.0, 10.0], [15500.0, 9.0], [15800.0, 1.0], [16200.0, 3.0], [16400.0, 3.0], [16900.0, 1.0], [16600.0, 1.0], [17200.0, 2.0], [16500.0, 1.0], [17100.0, 1.0], [17400.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 17400.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1959.0, "series": [{"data": [[1.0, 40.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1959.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 861.5940000000016, "minX": 1.54958322E12, "maxY": 861.5940000000016, "series": [{"data": [[1.54958322E12, 861.5940000000016]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 882.0, "minX": 1.0, "maxY": 17405.0, "series": [{"data": [[2.0, 15557.0], [3.0, 15334.0], [4.0, 14577.0], [5.0, 14402.0], [6.0, 14427.0], [7.0, 15411.0], [8.0, 15360.0], [9.0, 14980.0], [10.0, 14505.0], [11.0, 14590.0], [12.0, 14577.0], [13.0, 14779.0], [14.0, 14524.0], [15.0, 15600.0], [16.0, 15746.0], [17.0, 14783.0], [18.0, 14660.0], [19.0, 14498.0], [20.0, 15018.0], [21.0, 15065.0], [22.0, 14427.0], [23.0, 15032.0], [24.0, 15628.0], [26.0, 15301.5], [27.0, 15446.0], [28.0, 15769.0], [29.0, 14673.0], [30.0, 14419.0], [31.0, 15315.0], [32.0, 14772.0], [35.0, 14866.0], [34.0, 14738.0], [36.0, 15729.0], [39.0, 14744.0], [38.0, 15501.5], [41.0, 14694.0], [40.0, 15415.0], [43.0, 14591.0], [42.0, 14358.0], [45.0, 14409.0], [44.0, 15233.0], [47.0, 15423.0], [46.0, 15531.0], [49.0, 14542.0], [48.0, 15187.0], [51.0, 14913.0], [50.0, 14907.0], [53.0, 15455.0], [52.0, 15255.0], [55.0, 15344.0], [54.0, 14558.0], [57.0, 14340.0], [56.0, 14821.0], [59.0, 15456.0], [58.0, 14326.0], [61.0, 14399.0], [60.0, 15567.0], [63.0, 14377.0], [62.0, 14967.0], [67.0, 15290.0], [66.0, 14698.0], [65.0, 15283.0], [64.0, 14788.0], [71.0, 14450.0], [70.0, 14322.0], [69.0, 14514.0], [68.0, 14572.0], [75.0, 14548.0], [74.0, 14232.0], [73.0, 14450.0], [72.0, 14567.0], [79.0, 14518.0], [78.0, 14316.0], [77.0, 15138.0], [83.0, 15566.0], [82.0, 14337.0], [81.0, 14450.0], [80.0, 15003.0], [87.0, 14519.0], [86.0, 15261.0], [85.0, 14616.0], [84.0, 14370.0], [91.0, 14347.0], [90.0, 14216.0], [89.0, 15225.0], [94.0, 7303.0], [95.0, 14187.0], [93.0, 14783.0], [92.0, 15419.0], [99.0, 15331.0], [98.0, 14576.0], [97.0, 14173.0], [96.0, 14784.0], [103.0, 15333.0], [102.0, 15508.0], [101.0, 15421.0], [100.0, 15187.0], [107.0, 15420.0], [106.0, 14214.0], [105.0, 14303.0], [104.0, 17405.0], [111.0, 14848.0], [110.0, 14331.0], [109.0, 15288.0], [108.0, 14784.0], [115.0, 14850.0], [114.0, 14816.0], [113.0, 14864.0], [112.0, 14975.0], [119.0, 14174.0], [118.0, 14432.0], [117.0, 15087.0], [116.0, 14532.0], [123.0, 15113.0], [122.0, 14801.0], [121.0, 14748.0], [120.0, 14205.0], [127.0, 5184.333333333333], [126.0, 14235.0], [125.0, 14722.0], [124.0, 15266.0], [133.0, 7610.0], [135.0, 14561.0], [134.0, 14598.0], [132.0, 14271.0], [131.0, 14415.0], [129.0, 14100.0], [128.0, 14185.0], [143.0, 14889.0], [142.0, 14015.0], [141.0, 14408.0], [140.0, 15006.0], [139.0, 15079.0], [138.0, 14265.0], [137.0, 14529.0], [136.0, 14982.0], [147.0, 5136.666666666667], [151.0, 14068.0], [150.0, 14723.0], [149.0, 14542.0], [148.0, 14201.0], [146.0, 14013.0], [145.0, 14895.0], [144.0, 14259.0], [152.0, 5322.333333333333], [153.0, 7876.5], [156.0, 7431.5], [159.0, 4106.5], [158.0, 14784.0], [157.0, 14824.0], [155.0, 14120.0], [154.0, 15312.0], [166.0, 7585.0], [167.0, 14016.0], [165.0, 15244.0], [164.0, 15045.0], [163.0, 14601.0], [162.0, 14110.0], [161.0, 14982.0], [160.0, 15328.0], [170.0, 7595.0], [171.0, 3502.4], [175.0, 14192.0], [174.0, 14219.0], [173.0, 14706.0], [172.0, 14881.0], [169.0, 15128.0], [168.0, 14070.0], [179.0, 7987.5], [181.0, 7745.0], [183.0, 13905.0], [182.0, 14174.0], [180.0, 13990.0], [178.0, 14076.0], [177.0, 14680.0], [176.0, 14936.0], [191.0, 7543.0], [190.0, 14643.0], [189.0, 14716.0], [188.0, 14850.0], [187.0, 13912.0], [186.0, 14430.0], [185.0, 14261.0], [184.0, 14389.0], [196.0, 882.0], [199.0, 15162.0], [198.0, 15156.0], [197.0, 14364.0], [195.0, 14004.0], [194.0, 14662.0], [193.0, 14702.0], [192.0, 14623.0], [200.0, 7825.5], [201.0, 7667.5], [202.0, 7966.0], [205.0, 7518.0], [206.0, 5336.666666666667], [207.0, 13861.0], [204.0, 14234.0], [203.0, 14127.0], [208.0, 7496.5], [215.0, 14585.0], [214.0, 14267.0], [213.0, 14158.5], [211.0, 14107.0], [210.0, 14865.0], [209.0, 15162.0], [216.0, 7648.5], [217.0, 7890.5], [221.0, 5266.333333333333], [223.0, 14912.0], [222.0, 14321.0], [220.0, 15065.0], [219.0, 14581.0], [218.0, 15109.0], [226.0, 7622.0], [231.0, 14140.0], [230.0, 13816.0], [229.0, 14759.0], [228.0, 14365.0], [227.0, 14035.0], [225.0, 15070.0], [224.0, 13855.0], [239.0, 14840.0], [238.0, 14755.0], [237.0, 14105.0], [236.0, 14143.0], [235.0, 14333.0], [234.0, 14667.0], [233.0, 13769.0], [232.0, 13994.0], [241.0, 7540.5], [247.0, 14981.0], [246.0, 14328.0], [245.0, 14082.0], [244.0, 14395.0], [243.0, 14915.0], [242.0, 14192.0], [240.0, 14405.0], [254.0, 14009.0], [253.0, 13925.0], [252.0, 14032.0], [251.0, 14531.0], [250.0, 14594.0], [249.0, 14131.0], [248.0, 13799.0], [271.0, 13777.0], [259.0, 7938.0], [263.0, 15709.0], [256.0, 13899.5], [258.0, 14408.0], [257.0, 13937.0], [262.0, 14949.0], [261.0, 14738.0], [260.0, 14250.0], [264.0, 7435.5], [270.0, 13996.0], [269.0, 13769.0], [268.0, 14771.0], [267.0, 13790.0], [266.0, 13890.0], [265.0, 13903.0], [286.0, 13753.0], [276.0, 5398.333333333333], [277.0, 14231.0], [278.0, 9179.5], [287.0, 13481.0], [285.0, 13929.0], [284.0, 13942.0], [279.0, 14661.0], [273.0, 13717.0], [272.0, 14560.0], [275.0, 13712.0], [274.0, 14217.0], [283.0, 14231.0], [282.0, 14678.0], [281.0, 14421.5], [302.0, 14246.0], [303.0, 13890.0], [301.0, 15633.0], [291.0, 14109.0], [289.0, 14701.0], [288.0, 13961.0], [299.0, 13838.0], [298.0, 13789.0], [297.0, 13746.0], [296.0, 13825.0], [295.0, 14045.0], [294.0, 14747.0], [293.0, 14070.0], [292.0, 13779.0], [318.0, 14708.0], [319.0, 14094.0], [317.0, 14093.0], [316.0, 13735.0], [314.0, 13666.0], [313.0, 13717.0], [312.0, 14548.0], [311.0, 14603.0], [304.0, 14735.0], [307.0, 13735.0], [305.0, 13954.0], [310.0, 13735.0], [309.0, 14246.0], [308.0, 14309.0], [334.0, 13669.0], [335.0, 14284.0], [333.0, 15222.0], [332.0, 14001.0], [331.0, 14097.0], [330.0, 14332.0], [329.0, 14598.0], [328.0, 14515.0], [327.0, 14329.0], [321.0, 13912.0], [320.0, 14027.0], [323.0, 13738.0], [322.0, 14498.0], [326.0, 17248.0], [325.0, 16548.0], [324.0, 14560.0], [350.0, 13685.0], [351.0, 13499.0], [349.0, 13977.0], [348.0, 14493.0], [347.0, 13925.0], [346.0, 13472.0], [345.0, 14519.0], [344.0, 13630.0], [343.0, 16409.0], [337.0, 13248.0], [336.0, 14091.0], [339.0, 16671.0], [338.0, 14002.0], [342.0, 13872.0], [341.0, 14147.0], [340.0, 13933.0], [365.0, 13507.0], [366.0, 13789.0], [364.0, 13573.0], [355.0, 13889.0], [354.0, 16435.0], [353.0, 13255.0], [352.0, 13742.0], [363.0, 14076.0], [362.0, 13703.0], [361.0, 13782.0], [360.0, 13966.0], [359.0, 14356.0], [358.0, 15102.0], [357.0, 14235.0], [356.0, 13908.0], [382.0, 14022.0], [383.0, 14338.0], [381.0, 13587.0], [380.0, 13506.0], [379.0, 13971.0], [378.0, 14023.0], [377.0, 13805.0], [376.0, 16905.0], [375.0, 16202.0], [369.0, 14133.0], [368.0, 14267.5], [371.0, 13914.0], [370.0, 13637.0], [374.0, 13754.0], [373.0, 13722.0], [372.0, 13991.0], [398.0, 13105.0], [399.0, 15576.0], [397.0, 13029.0], [396.0, 14636.5], [394.0, 12772.0], [393.0, 12764.0], [392.0, 14563.0], [391.0, 14108.0], [385.0, 14202.0], [384.0, 13920.0], [387.0, 13647.0], [386.0, 13168.0], [390.0, 13713.0], [389.0, 14310.0], [388.0, 14170.0], [414.0, 13970.0], [415.0, 14583.0], [413.0, 13149.0], [412.0, 13013.0], [411.0, 14299.0], [410.0, 12787.0], [409.0, 13443.0], [408.0, 12776.0], [407.0, 13111.0], [400.0, 15532.0], [403.0, 13730.5], [401.0, 13834.0], [406.0, 14254.0], [405.0, 12939.0], [404.0, 13400.0], [430.0, 13238.0], [431.0, 15884.0], [429.0, 15638.0], [428.0, 12773.0], [427.0, 12414.0], [426.0, 12500.0], [425.0, 13160.0], [424.0, 13059.0], [423.0, 12713.0], [417.0, 12782.0], [416.0, 13143.0], [419.0, 15174.0], [418.0, 15574.0], [422.0, 13208.0], [421.0, 12846.0], [420.0, 12951.0], [446.0, 12585.0], [447.0, 12890.0], [445.0, 14868.0], [444.0, 12778.0], [443.0, 14358.0], [442.0, 13822.0], [441.0, 15775.0], [440.0, 15288.0], [439.0, 15238.0], [433.0, 13139.0], [432.0, 15326.0], [435.0, 12721.0], [434.0, 12889.0], [438.0, 14365.0], [437.0, 13014.0], [436.0, 12977.0], [462.0, 12943.0], [463.0, 5153.666666666666], [461.0, 15566.0], [460.0, 12692.0], [459.0, 12930.0], [457.0, 13208.0], [456.0, 12786.0], [455.0, 13037.0], [449.0, 12427.0], [448.0, 15661.0], [451.0, 15228.0], [450.0, 12812.0], [454.0, 13780.0], [453.0, 12598.0], [452.0, 12348.0], [478.0, 15205.0], [466.0, 7377.0], [465.0, 5372.333333333334], [464.0, 14145.0], [471.0, 13044.0], [470.0, 12979.0], [469.0, 13486.0], [468.0, 12770.0], [467.0, 5228.666666666666], [479.0, 7147.5], [473.0, 14043.0], [472.0, 13397.0], [477.0, 12067.0], [476.0, 13017.0], [475.0, 13228.0], [474.0, 12366.0], [494.0, 16235.0], [495.0, 13842.0], [493.0, 12964.0], [492.0, 15062.0], [491.0, 13842.0], [490.0, 14656.0], [489.0, 13867.0], [488.0, 13872.0], [487.0, 15149.0], [481.0, 16428.0], [480.0, 12711.0], [483.0, 15024.0], [482.0, 15459.0], [486.0, 13920.0], [485.0, 12113.0], [484.0, 13573.0], [498.0, 7431.5], [500.0, 7176.5], [507.0, 9178.0], [511.0, 12295.0], [509.0, 13689.0], [508.0, 15035.0], [499.0, 15007.0], [505.0, 12571.0], [504.0, 15481.0], [502.0, 12229.0], [497.0, 12586.0], [496.0, 13438.0], [501.0, 12281.0], [541.0, 14194.0], [518.0, 7209.5], [526.0, 7211.0], [525.0, 14135.0], [524.0, 13612.0], [523.0, 14659.0], [522.0, 15132.0], [521.0, 14516.0], [520.0, 14113.5], [527.0, 13101.0], [513.0, 14833.0], [512.0, 14292.0], [515.0, 12479.0], [514.0, 13222.0], [517.0, 13667.0], [516.0, 12785.0], [532.0, 7809.0], [531.0, 13548.0], [530.0, 13236.0], [529.0, 13254.0], [528.0, 11848.0], [533.0, 14947.0], [535.0, 14642.0], [534.0, 12566.0], [543.0, 13434.0], [542.0, 12516.0], [540.0, 13341.5], [538.0, 14884.0], [537.0, 12437.0], [536.0, 14878.0], [549.0, 7971.5], [573.0, 13543.0], [558.0, 9592.666666666666], [556.0, 13267.0], [555.0, 14400.5], [553.0, 14385.0], [552.0, 14450.0], [559.0, 13273.0], [544.0, 13398.0], [546.0, 13371.0], [545.0, 13369.0], [548.0, 14862.0], [547.0, 14410.0], [567.0, 7156.5], [566.0, 13048.0], [565.0, 15747.0], [564.0, 13956.0], [563.0, 14561.0], [562.0, 12441.5], [560.0, 14710.0], [575.0, 8181.0], [574.0, 13030.0], [571.0, 12438.0], [570.0, 12427.0], [569.0, 12364.0], [568.0, 13159.0], [551.0, 14754.0], [550.0, 12271.0], [602.0, 14409.0], [606.0, 13439.0], [580.0, 7623.0], [579.0, 13098.0], [578.0, 12387.0], [577.0, 13735.0], [576.0, 14485.0], [581.0, 12280.0], [583.0, 14280.0], [582.0, 14195.0], [591.0, 13837.0], [590.0, 12360.0], [589.0, 12686.0], [588.0, 11910.0], [587.0, 14096.0], [586.0, 14039.0], [585.0, 14366.0], [584.0, 13737.0], [601.0, 13514.0], [600.0, 12900.0], [592.0, 7521.0], [596.0, 7728.0], [595.0, 12247.0], [594.0, 12449.0], [593.0, 11983.0], [597.0, 12948.0], [599.0, 12314.0], [598.0, 12940.0], [607.0, 13396.0], [605.0, 12592.0], [604.0, 11799.0], [603.0, 12903.0], [637.0, 12537.5], [616.0, 7048.0], [618.0, 13207.0], [617.0, 11969.0], [620.0, 11608.0], [619.0, 12252.0], [622.0, 12342.0], [621.0, 12738.0], [625.0, 8352.0], [624.0, 13627.0], [627.0, 12684.0], [626.0, 12589.0], [629.0, 11224.0], [628.0, 12226.0], [631.0, 11516.0], [630.0, 12071.0], [633.0, 5898.333333333334], [639.0, 13411.0], [638.0, 12130.0], [635.0, 12634.0], [634.0, 13798.0], [632.0, 13433.0], [615.0, 12752.0], [614.0, 12766.0], [613.0, 11184.0], [612.0, 13722.0], [611.0, 11999.0], [610.0, 14319.0], [609.0, 13628.0], [608.0, 12275.0], [623.0, 14097.0], [668.0, 12167.0], [644.0, 7001.0], [655.0, 11464.0], [641.0, 13942.0], [640.0, 13590.0], [643.0, 12062.0], [642.0, 13927.0], [654.0, 12478.0], [653.0, 12504.0], [652.0, 11838.0], [651.0, 11568.0], [650.0, 13238.0], [649.0, 13403.0], [648.0, 12534.0], [665.0, 7697.0], [671.0, 13400.0], [657.0, 13403.0], [656.0, 12215.0], [659.0, 13086.0], [658.0, 11832.0], [661.0, 12010.0], [660.0, 13410.0], [663.0, 11599.0], [662.0, 11325.0], [670.0, 11238.0], [669.0, 13886.0], [667.0, 13075.0], [666.0, 12379.0], [664.0, 13504.0], [647.0, 15052.0], [646.0, 12574.0], [645.0, 13727.0], [698.0, 13290.0], [702.0, 13180.0], [674.0, 2024.0], [687.0, 5536.666666666666], [673.0, 11967.0], [672.0, 12217.0], [686.0, 11174.0], [685.0, 11893.0], [684.0, 12716.0], [683.0, 13526.0], [682.0, 12116.0], [681.0, 11365.0], [680.0, 11531.0], [688.0, 6848.5], [692.0, 7226.5], [691.0, 13578.0], [690.0, 11737.0], [689.0, 14491.0], [693.0, 12762.0], [695.0, 11163.0], [694.0, 12805.0], [701.0, 7283.0], [703.0, 11535.0], [700.0, 11865.0], [699.0, 13399.0], [697.0, 13354.0], [696.0, 14576.0], [679.0, 12086.0], [678.0, 11866.0], [677.0, 11553.0], [676.0, 12295.0], [675.0, 12017.5], [728.0, 10697.0], [734.0, 12571.0], [730.0, 7203.0], [729.0, 6701.5], [735.0, 10621.0], [721.0, 12403.0], [720.0, 12688.0], [723.0, 13314.0], [722.0, 12681.0], [725.0, 11689.0], [724.0, 13015.0], [733.0, 12475.0], [732.0, 14087.0], [731.0, 12403.0], [719.0, 12680.0], [705.0, 12506.0], [704.0, 11998.0], [707.0, 13236.0], [706.0, 11640.0], [709.0, 13331.0], [708.0, 12555.0], [711.0, 13296.0], [710.0, 11129.0], [718.0, 10981.0], [717.0, 11125.0], [716.0, 12511.0], [715.0, 11882.0], [714.0, 12961.0], [713.0, 10913.0], [712.0, 13048.0], [727.0, 10920.0], [726.0, 11229.0], [762.0, 11277.0], [766.0, 12090.0], [744.0, 7051.0], [746.0, 11176.0], [748.0, 11573.0], [747.0, 12688.0], [749.0, 6722.5], [751.0, 7149.0], [743.0, 10629.0], [742.0, 11418.0], [741.0, 11639.0], [740.0, 11566.0], [739.0, 14131.0], [738.0, 13091.0], [737.0, 10937.0], [736.0, 11430.0], [750.0, 14039.0], [761.0, 12018.0], [760.0, 12815.0], [763.0, 11441.0], [755.0, 6699.5], [758.0, 6623.0], [757.0, 12119.0], [756.0, 11292.0], [759.0, 11510.0], [767.0, 12379.0], [752.0, 10533.0], [754.0, 12496.0], [753.0, 12144.0], [765.0, 10788.0], [764.0, 12000.0], [797.0, 10333.0], [776.0, 6446.5], [777.0, 10910.0], [779.0, 10485.0], [778.0, 10239.0], [780.0, 5476.0], [791.0, 6591.5], [790.0, 11197.0], [789.0, 10558.0], [788.0, 10441.0], [787.0, 10922.0], [786.0, 11977.0], [785.0, 13703.0], [784.0, 10854.0], [799.0, 10245.0], [798.0, 10681.0], [796.0, 11850.0], [795.0, 12553.0], [794.0, 12007.0], [793.0, 10200.0], [792.0, 10958.0], [775.0, 10883.0], [774.0, 10479.0], [773.0, 10427.0], [772.0, 10372.0], [771.0, 12647.0], [769.0, 11347.0], [768.0, 12922.0], [783.0, 11973.0], [782.0, 12034.0], [781.0, 11228.0], [828.0, 10754.0], [803.0, 6640.0], [802.0, 10321.0], [801.0, 10317.0], [800.0, 12267.0], [804.0, 12035.0], [815.0, 10526.0], [814.0, 11351.0], [813.0, 12330.0], [812.0, 10891.0], [811.0, 10889.0], [810.0, 13336.0], [809.0, 10926.0], [808.0, 10593.0], [805.0, 6882.5], [826.0, 6479.0], [831.0, 9890.0], [817.0, 9773.0], [816.0, 10837.0], [819.0, 12256.0], [818.0, 11833.0], [821.0, 11929.0], [820.0, 10828.0], [823.0, 9670.0], [822.0, 10761.0], [830.0, 10183.0], [829.0, 9728.0], [827.0, 10246.0], [825.0, 13180.0], [824.0, 10472.0], [807.0, 10965.0], [806.0, 10329.0], [858.0, 10271.0], [862.0, 10063.0], [849.0, 7217.5], [850.0, 7383.5], [853.0, 10206.0], [852.0, 12405.0], [855.0, 9827.0], [854.0, 12996.0], [856.0, 6212.0], [847.0, 11287.0], [833.0, 10734.0], [832.0, 11272.0], [835.0, 10687.0], [834.0, 10464.0], [837.0, 9671.0], [836.0, 10685.0], [839.0, 10290.0], [838.0, 10145.0], [846.0, 11587.0], [845.0, 10533.0], [844.0, 9814.0], [843.0, 10069.0], [842.0, 10030.0], [841.0, 11846.0], [840.0, 11847.0], [857.0, 9776.0], [863.0, 9428.0], [848.0, 11116.0], [861.0, 9325.0], [860.0, 9803.0], [859.0, 9284.0], [893.0, 9366.0], [886.0, 6926.0], [885.0, 12627.0], [884.0, 11355.0], [883.0, 9178.0], [882.0, 11417.0], [881.0, 9478.0], [880.0, 9791.0], [887.0, 9657.0], [891.0, 6383.5], [895.0, 9297.0], [894.0, 9486.0], [892.0, 11086.0], [890.0, 9228.0], [889.0, 10095.0], [888.0, 9500.0], [871.0, 9635.0], [870.0, 9880.0], [869.0, 11576.0], [868.0, 9469.0], [867.0, 9201.0], [866.0, 9971.0], [865.0, 9992.0], [879.0, 10875.0], [878.0, 11415.0], [877.0, 9630.0], [876.0, 10223.0], [875.0, 9636.0], [874.0, 11391.0], [873.0, 12715.0], [872.0, 9471.0], [922.0, 9591.0], [926.0, 6348.5], [897.0, 6399.0], [898.0, 6464.5], [899.0, 9460.0], [901.0, 9811.0], [900.0, 10733.0], [903.0, 9166.0], [902.0, 9033.0], [921.0, 9445.0], [920.0, 9672.0], [923.0, 9464.0], [907.0, 6319.5], [906.0, 9969.0], [905.0, 9475.0], [904.0, 9013.0], [909.0, 9933.0], [908.0, 9164.0], [911.0, 9326.0], [896.0, 11212.0], [910.0, 8994.0], [913.0, 6290.0], [915.0, 6837.0], [914.0, 10931.0], [917.0, 9638.0], [916.0, 8998.0], [919.0, 9115.0], [918.0, 9073.0], [927.0, 9262.0], [912.0, 8878.0], [925.0, 9505.0], [924.0, 8980.0], [956.0, 8665.0], [928.0, 5219.666666666667], [940.0, 6908.666666666667], [938.0, 8906.0], [937.0, 9042.0], [936.0, 8834.0], [941.0, 9022.0], [943.0, 9232.0], [942.0, 9491.0], [957.0, 6908.5], [959.0, 9543.0], [945.0, 9192.0], [944.0, 8681.0], [947.0, 8974.0], [946.0, 8852.0], [949.0, 8955.0], [948.0, 9542.0], [951.0, 12041.0], [950.0, 9579.0], [958.0, 10549.0], [955.0, 8997.0], [954.0, 8697.0], [953.0, 9478.0], [952.0, 9369.0], [935.0, 9780.0], [934.0, 9555.0], [933.0, 9438.0], [932.0, 9374.0], [930.0, 9253.0], [929.0, 8846.0], [989.0, 8570.0], [967.0, 7028.5], [960.0, 6405.5], [975.0, 9631.0], [974.0, 9869.0], [973.0, 8354.0], [972.0, 8464.0], [971.0, 8662.0], [970.0, 10764.0], [969.0, 10214.0], [968.0, 9522.0], [961.0, 6378.5], [966.0, 7694.0], [964.0, 9263.0], [963.0, 10180.0], [962.0, 8701.0], [979.0, 6384.0], [978.0, 11298.0], [977.0, 10174.0], [976.0, 11264.0], [981.0, 7993.0], [980.0, 8254.0], [983.0, 9978.0], [982.0, 7769.0], [991.0, 7670.0], [990.0, 10072.0], [988.0, 8473.0], [987.0, 7967.0], [986.0, 8498.0], [985.0, 8604.0], [984.0, 7852.0], [998.0, 5680.0], [1003.0, 6137.0], [1002.0, 4981.333333333333], [1004.0, 6232.666666666666], [1005.0, 7997.0], [1001.0, 5731.0], [1000.0, 5973.5], [999.0, 4298.142857142857], [1017.0, 7648.0], [1016.0, 7580.0], [1020.0, 9623.0], [1018.0, 9291.0], [1022.0, 8309.0], [1021.0, 7904.0], [1011.0, 6079.5], [1010.0, 7309.0], [1009.0, 8062.0], [1008.0, 9738.0], [1012.0, 7834.0], [1015.0, 8083.0], [1013.0, 8365.0], [1023.0, 7303.0], [997.0, 5156.666666666667], [996.0, 8110.0], [995.0, 7565.0], [994.0, 8067.0], [993.0, 11033.0], [992.0, 7523.0], [1007.0, 8345.5], [1028.0, 9044.0], [1074.0, 7778.0], [1082.0, 7391.0], [1086.0, 7492.0], [1036.0, 8877.0], [1034.0, 7960.0], [1032.0, 10977.0], [1030.0, 9957.0], [1026.0, 9096.0], [1024.0, 7238.0], [1038.0, 7085.0], [1054.0, 8008.0], [1052.0, 8566.0], [1050.0, 7255.0], [1048.0, 9312.0], [1046.0, 9481.0], [1044.0, 8130.0], [1042.0, 8063.0], [1040.0, 8738.0], [1072.0, 7490.0], [1076.0, 8877.0], [1078.0, 7345.0], [1080.0, 6832.0], [1062.0, 5351.5], [1066.0, 8726.0], [1064.0, 7980.0], [1068.0, 7892.0], [1070.0, 9069.0], [1056.0, 9163.0], [1058.0, 7236.0], [1060.0, 10486.0], [1084.0, 9122.0], [1096.0, 7693.0], [1102.0, 7741.0], [1100.0, 6993.0], [1098.0, 6053.5], [1094.0, 8937.0], [1092.0, 8585.0], [1090.0, 7234.0], [1088.0, 6874.0], [1120.0, 5286.5], [1122.0, 7441.0], [1124.0, 10161.0], [1150.0, 9658.0], [1148.0, 6296.5], [1146.0, 7046.0], [1142.0, 8003.0], [1144.0, 8447.0], [1136.0, 6069.0], [1138.0, 9796.0], [1140.0, 9735.0], [1128.0, 7355.0], [1126.0, 8899.0], [1130.0, 8627.0], [1132.0, 8438.0], [1134.0, 5497.0], [1108.0, 5312.5], [1106.0, 7603.0], [1104.0, 7502.0], [1110.0, 6688.0], [1112.0, 5585.0], [1116.0, 5680.0], [1114.0, 8118.0], [1118.0, 5323.5], [1204.0, 6188.0], [1158.0, 5004.0], [1160.0, 8164.0], [1156.0, 7706.0], [1154.0, 7885.0], [1152.0, 8254.0], [1182.0, 9549.0], [1162.0, 6594.0], [1184.0, 8325.0], [1186.0, 6084.0], [1214.0, 9482.0], [1212.0, 7810.0], [1210.0, 5069.5], [1208.0, 9256.0], [1206.0, 8194.0], [1200.0, 7758.0], [1166.0, 8007.0], [1164.0, 7028.0], [1202.0, 5791.5], [1188.0, 5889.5], [1190.0, 6170.0], [1192.0, 6857.0], [1194.0, 6851.0], [1196.0, 8322.0], [1198.0, 8468.0], [1170.0, 6147.5], [1168.0, 8099.0], [1172.0, 8325.0], [1176.0, 7336.0], [1174.0, 8114.0], [1178.0, 7642.5], [1180.0, 6276.0], [1226.0, 7851.0], [1268.0, 5274.333333333333], [1220.0, 6810.5], [1222.0, 7196.0], [1224.0, 7356.0], [1228.0, 6585.0], [1230.0, 8965.0], [1264.0, 7319.0], [1236.0, 8202.0], [1234.0, 6506.0], [1232.0, 7277.0], [1238.0, 7794.0], [1240.0, 7916.0], [1242.0, 8973.0], [1216.0, 6633.0], [1218.0, 6674.0], [1246.0, 6144.5], [1244.0, 7747.0], [1252.0, 5860.0], [1250.0, 6334.0], [1248.0, 6400.0], [1254.0, 7423.0], [1256.0, 6981.0], [1258.0, 6790.0], [1260.0, 7902.0], [1262.0, 6677.0], [1266.0, 7343.0], [1278.0, 7861.0], [1276.0, 8695.0], [1274.0, 6100.0], [1272.0, 7099.0], [1270.0, 7609.0], [1342.0, 6536.5], [1290.0, 5855.5], [1286.0, 5339.0], [1280.0, 5148.0], [1310.0, 8410.0], [1304.0, 7318.0], [1306.0, 7441.0], [1308.0, 7392.0], [1282.0, 5482.666666666667], [1288.0, 6647.0], [1316.0, 5362.25], [1318.0, 4896.0], [1320.0, 8079.0], [1322.0, 7411.0], [1324.0, 5663.0], [1326.0, 5650.0], [1314.0, 7517.0], [1312.0, 8386.0], [1338.0, 6770.0], [1340.0, 6281.5], [1336.0, 6953.0], [1330.0, 8401.0], [1332.0, 8249.0], [1334.0, 5702.666666666667], [1328.0, 5274.5], [1294.0, 6988.0], [1292.0, 7561.0], [1300.0, 6107.0], [1298.0, 8238.0], [1296.0, 8524.0], [1302.0, 4978.0], [1350.0, 5591.666666666667], [1344.0, 5088.0], [1372.0, 5120.0], [1374.0, 5562.5], [1370.0, 4518.5], [1366.0, 6778.0], [1364.0, 7852.0], [1368.0, 5043.5], [1348.0, 5166.0], [1346.0, 7916.0], [1362.0, 5337.0], [1360.0, 5244.5], [1358.0, 5264.0], [1356.0, 6855.0], [1354.0, 7995.0], [1352.0, 8002.0], [1392.0, 4959.333333333333], [1394.0, 6503.0], [1396.0, 7569.0], [1398.0, 7331.0], [1400.0, 7290.0], [1402.0, 5835.0], [1404.0, 6415.0], [1406.0, 6372.0], [1376.0, 5657.0], [1378.0, 5372.0], [1382.0, 5599.5], [1384.0, 7695.0], [1386.0, 5264.0], [1390.0, 5022.25], [1388.0, 4471.6], [1380.0, 5322.0], [1466.0, 4919.6], [1412.0, 5618.333333333333], [1408.0, 5269.5], [1410.0, 7489.0], [1438.0, 4913.333333333333], [1416.0, 7105.0], [1414.0, 7226.0], [1418.0, 7276.0], [1420.0, 6186.0], [1442.0, 6958.0], [1444.0, 6271.0], [1446.0, 4921.5], [1448.0, 5656.0], [1450.0, 5822.5], [1454.0, 5739.0], [1452.0, 7014.0], [1440.0, 5685.0], [1470.0, 5379.333333333333], [1468.0, 5994.0], [1460.0, 5711.0], [1462.0, 5993.0], [1464.0, 5566.333333333333], [1458.0, 5294.0], [1456.0, 5817.333333333333], [1422.0, 7160.0], [1428.0, 6319.0], [1426.0, 6261.0], [1424.0, 7160.0], [1430.0, 5052.5], [1432.0, 5642.0], [1434.0, 5358.0], [1436.0, 6017.5], [1480.0, 5615.0], [1498.0, 4831.5], [1472.0, 4882.0], [1478.0, 5570.0], [1476.0, 6024.0], [1474.0, 6707.0], [1500.0, 5885.0], [1502.0, 4926.0], [1494.0, 5781.0], [1496.0, 5109.0], [1482.0, 5922.0], [1486.0, 5690.0], [1484.0, 5334.0], [1520.0, 4971.0], [1522.0, 6438.0], [1524.0, 5389.666666666667], [1526.0, 5623.0], [1530.0, 5504.0], [1532.0, 5696.0], [1534.0, 5687.5], [1528.0, 5575.0], [1504.0, 4887.5], [1506.0, 5824.5], [1508.0, 5131.6], [1510.0, 5620.5], [1518.0, 6710.0], [1516.0, 5277.5], [1512.0, 6678.0], [1490.0, 4830.125], [1488.0, 5903.0], [1492.0, 5397.0], [1542.0, 5128.5], [1540.0, 4823.333333333333], [1562.0, 5377.5], [1538.0, 5939.0], [1536.0, 5731.0], [1564.0, 4577.0], [1544.0, 6049.5], [1546.0, 4847.0], [1548.0, 5630.0], [1550.0, 5417.0], [1552.0, 5306.0], [1554.0, 5655.0], [1560.0, 5005.0], [1558.0, 4718.0], [1031.0, 9028.0], [1037.0, 6573.5], [1035.0, 8052.0], [1033.0, 9133.0], [1029.0, 9110.0], [1027.0, 8288.0], [1025.0, 8830.0], [1039.0, 8857.0], [1055.0, 8056.0], [1053.0, 8073.0], [1051.0, 9349.0], [1049.0, 7474.0], [1047.0, 8781.0], [1045.0, 8132.0], [1043.0, 9129.0], [1041.0, 9457.0], [1073.0, 8756.0], [1075.0, 8684.0], [1077.0, 7687.0], [1079.0, 8334.0], [1081.0, 7801.0], [1067.0, 5375.333333333333], [1065.0, 7574.0], [1063.0, 7493.0], [1069.0, 7777.0], [1071.0, 8507.0], [1087.0, 8535.0], [1057.0, 10419.0], [1059.0, 7987.0], [1061.0, 10471.0], [1085.0, 7741.0], [1083.0, 7692.0], [1095.0, 7690.0], [1103.0, 4607.666666666667], [1119.0, 5419.0], [1099.0, 5209.0], [1097.0, 6012.0], [1093.0, 8449.0], [1091.0, 7746.0], [1089.0, 7738.0], [1121.0, 8854.0], [1123.0, 7447.0], [1151.0, 7201.0], [1149.0, 7997.0], [1147.0, 5720.5], [1143.0, 4975.0], [1145.0, 6282.0], [1137.0, 8465.0], [1139.0, 7235.0], [1141.0, 5404.5], [1125.0, 5105.0], [1129.0, 6188.5], [1127.0, 7879.0], [1131.0, 8124.0], [1133.0, 7335.0], [1135.0, 7913.0], [1107.0, 8302.0], [1105.0, 8576.0], [1109.0, 8760.0], [1111.0, 7588.0], [1115.0, 8447.0], [1113.0, 7562.0], [1117.0, 8605.0], [1205.0, 4685.25], [1163.0, 5497.0], [1159.0, 5107.0], [1157.0, 6023.5], [1155.0, 8382.0], [1153.0, 9557.0], [1181.0, 5419.0], [1183.0, 5761.666666666667], [1161.0, 4355.0], [1185.0, 6870.0], [1187.0, 9362.0], [1215.0, 8469.0], [1213.0, 8145.0], [1209.0, 8274.0], [1207.0, 6715.0], [1211.0, 5416.5], [1203.0, 7393.0], [1201.0, 6441.0], [1167.0, 7745.0], [1165.0, 9538.0], [1189.0, 8049.0], [1191.0, 7868.0], [1193.0, 8465.0], [1195.0, 7529.0], [1197.0, 9428.0], [1199.0, 6773.0], [1171.0, 6670.0], [1169.0, 7022.0], [1173.0, 5728.0], [1179.0, 6970.0], [1225.0, 9119.0], [1277.0, 7688.0], [1219.0, 5040.5], [1221.0, 8343.0], [1223.0, 8005.0], [1227.0, 5826.0], [1229.0, 7453.0], [1231.0, 7745.0], [1265.0, 7550.0], [1237.0, 4917.0], [1235.0, 8167.0], [1233.0, 6573.0], [1239.0, 6460.0], [1241.0, 6451.0], [1243.0, 4469.0], [1247.0, 6408.0], [1217.0, 7487.0], [1251.0, 7424.0], [1249.0, 7950.0], [1253.0, 8943.0], [1255.0, 7322.0], [1257.0, 8980.0], [1259.0, 8638.0], [1261.0, 8967.0], [1263.0, 6203.0], [1267.0, 4470.2], [1279.0, 6045.0], [1275.0, 6028.0], [1273.0, 7690.0], [1271.0, 8899.0], [1269.0, 7159.0], [1285.0, 8610.0], [1311.0, 7449.0], [1303.0, 3841.0], [1305.0, 7586.0], [1307.0, 8575.0], [1309.0, 6464.5], [1281.0, 5282.333333333333], [1283.0, 8710.0], [1287.0, 3960.0], [1289.0, 5209.75], [1317.0, 5586.666666666667], [1321.0, 6298.0], [1319.0, 8461.0], [1323.0, 7186.0], [1325.0, 8449.0], [1327.0, 5416.333333333333], [1315.0, 6492.0], [1313.0, 8449.0], [1343.0, 4875.666666666667], [1341.0, 5054.666666666667], [1339.0, 5718.0], [1335.0, 5691.5], [1337.0, 5580.5], [1331.0, 6266.0], [1333.0, 5587.5], [1295.0, 5889.0], [1293.0, 7520.0], [1291.0, 7462.0], [1329.0, 6031.5], [1299.0, 7265.0], [1297.0, 6836.0], [1301.0, 7390.0], [1349.0, 5660.0], [1351.0, 5630.5], [1345.0, 6371.5], [1375.0, 5066.0], [1373.0, 5858.666666666667], [1371.0, 5857.5], [1369.0, 7801.0], [1367.0, 5839.5], [1365.0, 8013.0], [1363.0, 7185.0], [1347.0, 8145.0], [1361.0, 4962.8], [1359.0, 6278.0], [1357.0, 8015.0], [1355.0, 6635.0], [1353.0, 7301.0], [1395.0, 5010.5], [1393.0, 6361.0], [1397.0, 7386.0], [1399.0, 7348.0], [1405.0, 6157.5], [1403.0, 7445.0], [1407.0, 5088.333333333333], [1377.0, 7986.0], [1379.0, 7661.0], [1381.0, 5191.5], [1385.0, 5154.0], [1383.0, 6929.0], [1389.0, 5305.6], [1391.0, 4816.0], [1387.0, 6536.0], [1465.0, 5367.5], [1433.0, 4736.0], [1409.0, 7234.0], [1411.0, 6575.0], [1437.0, 6896.0], [1439.0, 5118.333333333333], [1417.0, 5004.666666666667], [1415.0, 7213.0], [1413.0, 7712.0], [1419.0, 4444.0], [1421.0, 4695.0], [1441.0, 4914.0], [1443.0, 5276.0], [1447.0, 6030.0], [1449.0, 6824.0], [1453.0, 6307.0], [1451.0, 5796.0], [1445.0, 5068.5], [1471.0, 5751.0], [1469.0, 5175.666666666667], [1467.0, 5656.0], [1461.0, 5404.5], [1463.0, 4825.5], [1459.0, 4943.5], [1457.0, 5714.0], [1423.0, 6596.0], [1429.0, 4868.0], [1427.0, 6024.0], [1425.0, 6030.0], [1431.0, 7245.0], [1435.0, 6053.0], [1481.0, 5907.0], [1493.0, 5352.0], [1479.0, 5384.5], [1477.0, 6578.0], [1475.0, 5747.0], [1473.0, 5426.0], [1503.0, 4339.5], [1499.0, 5181.75], [1501.0, 5444.0], [1497.0, 4886.0], [1495.0, 5075.333333333333], [1483.0, 5745.0], [1487.0, 4620.0], [1485.0, 5938.0], [1523.0, 5084.625], [1521.0, 6542.0], [1525.0, 4884.5], [1527.0, 6443.0], [1529.0, 6128.0], [1533.0, 5327.5], [1531.0, 6607.0], [1535.0, 4654.0], [1505.0, 6400.0], [1517.0, 6029.5], [1519.0, 4962.666666666667], [1515.0, 6130.0], [1513.0, 6356.0], [1511.0, 6447.0], [1509.0, 5447.0], [1489.0, 6451.0], [1491.0, 4788.75], [1541.0, 4861.0], [1539.0, 5633.5], [1537.0, 5524.0], [1563.0, 5388.4], [1565.0, 4313.0], [1545.0, 4685.5], [1547.0, 5009.0], [1549.0, 5000.0], [1551.0, 5887.0], [1553.0, 5643.0], [1555.0, 4797.0], [1557.0, 4957.333333333333], [1561.0, 5017.0], [1559.0, 4886.333333333333], [1.0, 14562.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[861.5940000000016, 9339.493999999993]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1565.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 12566.666666666666, "minX": 1.54958322E12, "maxY": 13997.95, "series": [{"data": [[1.54958322E12, 13997.95]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958322E12, 12566.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 9339.493999999993, "minX": 1.54958322E12, "maxY": 9339.493999999993, "series": [{"data": [[1.54958322E12, 9339.493999999993]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 9339.488000000001, "minX": 1.54958322E12, "maxY": 9339.488000000001, "series": [{"data": [[1.54958322E12, 9339.488000000001]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 69.87950000000012, "minX": 1.54958322E12, "maxY": 69.87950000000012, "series": [{"data": [[1.54958322E12, 69.87950000000012]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 415.0, "minX": 1.54958322E12, "maxY": 17405.0, "series": [{"data": [[1.54958322E12, 17405.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958322E12, 415.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958322E12, 14577.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958322E12, 15728.8]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958322E12, 15023.699999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 9058.0, "minX": 33.0, "maxY": 9058.0, "series": [{"data": [[33.0, 9058.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 9058.0, "minX": 33.0, "maxY": 9058.0, "series": [{"data": [[33.0, 9058.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54958322E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54958322E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54958322E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54958322E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958322E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54958322E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54958322E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958322E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
